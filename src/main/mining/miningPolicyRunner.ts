import { MiningPowerStatus } from "../../bridge/types";
import {
  decideMining,
  needsPeriodicCheck,
  type MiningConditions,
} from "./miningPolicy";

// How often idle time is re-checked while a timed condition is on.
export const POLICY_CHECK_INTERVAL_MS = 15_000;

/** The policy's view of the node and the app; tests pass fakes. */
export interface MiningPolicyDeps {
  readonly readConditions: () => MiningConditions;
  readonly isMinerRunning: () => Promise<boolean>;
  readonly startMiner: () => Promise<void>;
  readonly stopMiner: () => Promise<void>;
  readonly publish: (status: MiningPowerStatus) => void;
}

/**
 * Applies decideMining to the node: starts the miner when mining the user
 * switched on may run, stops it while a condition holds it back. With mining
 * switched off it never touches the miner, so it cannot start mining on its
 * own. Evaluations never overlap; one requested meanwhile runs afterwards.
 */
export class MiningPolicy {
  private status: MiningPowerStatus = MiningPowerStatus.STOPPED;
  private running: Promise<void> | null = null;
  private isRerunNeeded = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: MiningPolicyDeps) {}

  /** @returns The last decision. */
  public getStatus(): MiningPowerStatus {
    return this.status;
  }

  /**
   * Re-decides and applies the decision.
   * @returns Resolves once this and any queued evaluation finished.
   */
  public async evaluate(): Promise<void> {
    if (this.running) {
      this.isRerunNeeded = true;
      return this.running;
    }
    this.running = this.runUntilSettled();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  private async runUntilSettled(): Promise<void> {
    do {
      this.isRerunNeeded = false;
      await this.applyOnce();
    } while (this.isRerunNeeded);
  }

  /** Runs the periodic check only while a timed condition needs it. */
  private syncTimer(conditions: MiningConditions): void {
    const isNeeded = needsPeriodicCheck(conditions);
    if (isNeeded && !this.timer) {
      this.timer = setInterval(
        () => void this.evaluate(),
        POLICY_CHECK_INTERVAL_MS,
      );
    } else if (!isNeeded && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async applyOnce(): Promise<void> {
    const conditions = this.deps.readConditions();
    this.syncTimer(conditions);
    const decision = decideMining(conditions);
    if (decision !== MiningPowerStatus.STOPPED) {
      try {
        const isRunning = await this.deps.isMinerRunning();
        const shouldRun = decision === MiningPowerStatus.MINING;
        if (shouldRun && !isRunning) await this.deps.startMiner();
        if (!shouldRun && isRunning) await this.deps.stopMiner();
      } catch (err) {
        console.warn("[mining:policy] Could not apply the decision:", err);
      }
    }
    if (decision !== this.status) {
      this.status = decision;
      this.deps.publish(decision);
    }
  }
}
