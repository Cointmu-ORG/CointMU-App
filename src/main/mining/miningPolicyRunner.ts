import { MiningPowerStatus } from "../../bridge/types";
import { decideMining, type MiningConditions } from "./miningPolicy";

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

  private async applyOnce(): Promise<void> {
    const decision = decideMining(this.deps.readConditions());
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
