import { SyncStallStep } from "../../../bridge/types";

export const SYNC_POLL_INTERVAL_MS = 30_000;
/** How long the head may stand still, with peers ahead, before each step. */
export const STALL_WINDOW_MS = 300_000;

/** One reading of the node's sync position. */
export interface SyncProgress {
  readonly localBlock: number;
  /** eth_syncing reports a higher block, or a peer has more total difficulty. */
  readonly isBehind: boolean;
  readonly peers: number;
}

export interface SyncStallWatchdogDeps {
  readonly isGethRunning: () => boolean;
  /**
   * True while recovery (#99/#42), a chain data move or a resync owns the
   * node lifecycle; the watchdog then neither counts nor restarts.
   */
  readonly isLifecycleBusy: () => boolean;
  /** Resolves the progress, or null when geth did not answer. */
  readonly readProgress: () => Promise<SyncProgress | null>;
  readonly reregisterPeers: () => Promise<void>;
  /** Restarts geth through the shared restart path (nodeRestart). */
  readonly restartNode: () => void;
  /** Called only when the step changes. */
  readonly broadcast: (step: SyncStallStep | null) => void;
}

const NEXT_STEP: Readonly<Record<string, SyncStallStep>> = {
  none: SyncStallStep.REREGISTER_PEERS,
  [SyncStallStep.REREGISTER_PEERS]: SyncStallStep.RESTART_NODE,
  [SyncStallStep.RESTART_NODE]: SyncStallStep.NEEDS_RESYNC,
};

/**
 * Detects a stalled sync — peers ahead, at least one peer, and a head that
 * has not moved for STALL_WINDOW_MS — and escalates one step per window:
 * re-register the static peers, restart geth, then ask the user to resync.
 * It never resyncs by itself. Zero peers is left to the peer watchdog (#59).
 */
export class SyncStallWatchdog {
  private step: SyncStallStep | null = null;
  private lastBlock: number | null = null;
  private stillSinceMs = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: SyncStallWatchdogDeps) {}

  /** Starts polling without keeping the process alive; repeated calls are ignored. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), SYNC_POLL_INTERVAL_MS);
    this.timer.unref();
  }

  /** @returns The step under way, or null while sync is healthy. */
  getStep(): SyncStallStep | null {
    return this.step;
  }

  /** Runs one poll. */
  async tick(nowMs = Date.now()): Promise<void> {
    if (this.deps.isLifecycleBusy()) {
      this.restartClock(nowMs);
      this.setStep(null);
      return;
    }
    // Geth restarting (our own step b included): pause, keep the step.
    if (!this.deps.isGethRunning()) return this.restartClock(nowMs);
    const progress = await this.deps.readProgress();
    if (progress === null) return;

    if (this.lastBlock === null || progress.localBlock < this.lastBlock) {
      this.lastBlock = progress.localBlock;
      this.stillSinceMs = nowMs;
      return;
    }
    const hasMoved = progress.localBlock > this.lastBlock;
    if (hasMoved || progress.peers < 1 || !progress.isBehind) {
      this.lastBlock = progress.localBlock;
      this.stillSinceMs = nowMs;
      this.setStep(null);
      return;
    }
    if (nowMs - this.stillSinceMs >= STALL_WINDOW_MS)
      await this.escalate(nowMs);
  }

  private async escalate(nowMs: number): Promise<void> {
    if (this.step === SyncStallStep.NEEDS_RESYNC) return;
    const next = NEXT_STEP[this.step ?? "none"];
    this.stillSinceMs = nowMs;
    this.setStep(next);
    if (next === SyncStallStep.REREGISTER_PEERS) {
      await this.deps.reregisterPeers();
    } else if (next === SyncStallStep.RESTART_NODE) {
      this.lastBlock = null;
      this.deps.restartNode();
    }
  }

  private restartClock(nowMs: number): void {
    this.lastBlock = null;
    this.stillSinceMs = nowMs;
  }

  private setStep(step: SyncStallStep | null): void {
    if (step === this.step) return;
    this.step = step;
    console.warn(`[sync] Stall step: ${step ?? "cleared"}`);
    this.deps.broadcast(step);
  }
}
