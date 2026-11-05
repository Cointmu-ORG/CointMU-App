import {
  MiningAutoStartPhase,
  type MiningAutoStartState,
} from "../../bridge/types";
import type { NodeStatus } from "../geth/rpc/nodeStatus";

/** The wait after every condition is met, not after the app opened. */
export const AUTO_START_DELAY_MS = 30_000;
/** How often the conditions are read while waiting or counting down. */
export const AUTO_START_POLL_MS = 5_000;
const MIN_PEERS = 1;

/** The settings side of the conditions, read fresh for every check. */
export interface AutoStartSettings {
  /** Settings → Mining → Start mining at launch. */
  readonly isOn: boolean;
  /** Settings → Mining → Enable Mining, the permission to mine at all. */
  readonly isMiningAllowed: boolean;
  readonly hasRewardAddress: boolean;
  /** On battery with Pause on battery on: wait until plugged in. */
  readonly isHeldByBattery: boolean;
}

/** The node, the settings and the miner; tests pass fakes. */
export interface MiningAutoStartDeps {
  readonly readSettings: () => AutoStartSettings;
  readonly readNodeStatus: () => Promise<NodeStatus>;
  /** The user (or this) started mining this session. */
  readonly isMiningStarted: () => boolean;
  /** Starts mining as the Mining page does; the policy governs it after. */
  readonly startMining: () => Promise<void>;
  readonly publish: (state: MiningAutoStartState) => void;
  readonly now: () => number;
}

/**
 * @param settings - The settings side.
 * @param node - The node's status.
 * @returns Whether every condition for starting mining at launch holds: the
 *   node answers, has a peer and is not syncing, a reward address is set,
 *   mining is allowed, and the battery does not hold it back.
 */
export function isReadyToMine(
  settings: AutoStartSettings,
  node: NodeStatus,
): boolean {
  return (
    settings.isOn &&
    settings.isMiningAllowed &&
    settings.hasRewardAddress &&
    !settings.isHeldByBattery &&
    node.isOnline &&
    node.syncPercent === null &&
    (node.peers ?? 0) >= MIN_PEERS
  );
}

/**
 * Starts mining once per session when "Start mining at launch" is on:
 * waits until isReadyToMine holds, counts down AUTO_START_DELAY_MS, checks
 * again and starts. A lost condition during the countdown goes back to
 * waiting. Cancel, a manual start or stop, or turning the setting off ends
 * it for the session.
 */
export class MiningAutoStart {
  private phase: MiningAutoStartPhase = MiningAutoStartPhase.WAITING;
  private startsAt: number | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor(private readonly deps: MiningAutoStartDeps) {}

  /** @returns The phase, and when mining starts while counting down. */
  public getState(): MiningAutoStartState {
    return { phase: this.phase, startsAt: this.startsAt };
  }

  /**
   * Called once at launch. Does nothing for the session when the setting
   * is off then.
   */
  public begin(): void {
    if (!this.deps.readSettings().isOn) {
      this.finish();
      return;
    }
    this.pollTimer = setInterval(() => void this.check(), AUTO_START_POLL_MS);
    void this.check();
  }

  /** The user cancelled: no automatic start for the rest of the session. */
  public cancel(): void {
    this.finish();
  }

  /** The user started or stopped mining by hand: same as cancel. */
  public endForSession(): void {
    this.finish();
  }

  /**
   * A method, not an inline comparison, so TypeScript does not narrow the
   * phase across an await: cancel() may change it meanwhile.
   * @param phase - A phase.
   * @returns Whether the auto-start is in it now.
   */
  private isPhase(phase: MiningAutoStartPhase): boolean {
    return this.phase === phase;
  }

  private async check(): Promise<void> {
    if (this.isPhase(MiningAutoStartPhase.DONE) || this.isChecking) return;
    this.isChecking = true;
    try {
      const isReady = await this.isReady();
      if (this.isPhase(MiningAutoStartPhase.DONE)) return;
      if (!isReady) this.backToWaiting();
      else if (this.isPhase(MiningAutoStartPhase.WAITING)) this.countDown();
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * @returns Whether mining may start now. Ends the session's auto-start
   *   when the setting was turned off or mining was started meanwhile.
   */
  private async isReady(): Promise<boolean> {
    const settings = this.deps.readSettings();
    if (!settings.isOn || this.deps.isMiningStarted()) {
      this.finish();
      return false;
    }
    try {
      return isReadyToMine(settings, await this.deps.readNodeStatus());
    } catch (err) {
      console.warn("[mining:auto-start] Could not read the node:", err);
      return false;
    }
  }

  private countDown(): void {
    this.phase = MiningAutoStartPhase.COUNTDOWN;
    this.startsAt = this.deps.now() + AUTO_START_DELAY_MS;
    this.countdownTimer = setTimeout(
      () => void this.fire(),
      AUTO_START_DELAY_MS,
    );
    this.publish();
  }

  private backToWaiting(): void {
    if (this.phase !== MiningAutoStartPhase.COUNTDOWN) return;
    this.clearCountdown();
    this.phase = MiningAutoStartPhase.WAITING;
    this.startsAt = null;
    this.publish();
  }

  private async fire(): Promise<void> {
    this.countdownTimer = null;
    if (!this.isPhase(MiningAutoStartPhase.COUNTDOWN)) return;
    const isReady = await this.isReady();
    if (!this.isPhase(MiningAutoStartPhase.COUNTDOWN)) return;
    if (!isReady) {
      this.backToWaiting();
      return;
    }
    this.finish();
    try {
      await this.deps.startMining();
    } catch (err) {
      console.error("[mining:auto-start] Could not start mining:", err);
    }
  }

  private clearCountdown(): void {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.countdownTimer = null;
  }

  private finish(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.clearCountdown();
    const wasDone = this.phase === MiningAutoStartPhase.DONE;
    this.phase = MiningAutoStartPhase.DONE;
    this.startsAt = null;
    if (!wasDone) this.publish();
  }

  private publish(): void {
    this.deps.publish(this.getState());
  }
}
