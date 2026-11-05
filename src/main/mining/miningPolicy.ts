import { MiningPowerStatus } from "../../bridge/types";

/** Everything the policy weighs, read fresh for every decision. */
export interface MiningConditions {
  /** The user switched mining on. */
  readonly isEnabled: boolean;
  readonly isOnBattery: boolean;
  readonly pauseOnBattery: boolean;
}

/**
 * Decides whether mining the user switched on should run now. The first
 * condition that holds it back is the reason shown in the UI.
 * @param conditions - The current conditions.
 * @returns MINING, a PAUSED_* reason, or STOPPED while the user has mining off.
 */
export function decideMining(conditions: MiningConditions): MiningPowerStatus {
  if (!conditions.isEnabled) return MiningPowerStatus.STOPPED;
  if (conditions.pauseOnBattery && conditions.isOnBattery) {
    return MiningPowerStatus.PAUSED_BATTERY;
  }
  return MiningPowerStatus.MINING;
}
