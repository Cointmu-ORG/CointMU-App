import { MiningPowerStatus } from "../../bridge/types";

/** Everything the policy weighs, read fresh for every decision. */
export interface MiningConditions {
  /** The user switched mining on. */
  readonly isEnabled: boolean;
  readonly isOnBattery: boolean;
  readonly pauseOnBattery: boolean;
  /** Mine only while the computer is idle. */
  readonly idleOnly: boolean;
  /** Seconds without keyboard or mouse input; read only while idleOnly. */
  readonly idleSeconds: number;
  readonly idleThresholdSeconds: number;
}

/**
 * @param conditions - The current conditions.
 * @returns Whether a condition can change with time alone (idle), so the
 *   policy must re-check on a timer while mining is started.
 */
export function needsPeriodicCheck(conditions: MiningConditions): boolean {
  return conditions.isEnabled && conditions.idleOnly;
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
  if (
    conditions.idleOnly &&
    conditions.idleSeconds < conditions.idleThresholdSeconds
  ) {
    return MiningPowerStatus.PAUSED_USER_ACTIVE;
  }
  return MiningPowerStatus.MINING;
}
