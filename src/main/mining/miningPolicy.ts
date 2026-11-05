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
  /** Mine only between scheduleStart and scheduleEnd (local minutes of day). */
  readonly isScheduled: boolean;
  readonly scheduleStartMinutes: number;
  readonly scheduleEndMinutes: number;
  readonly nowMinutes: number;
}

/**
 * @param start - Window start, minutes after local midnight.
 * @param end - Window end; before start means it runs past midnight.
 * @param now - The current minute of the day.
 * @returns True inside [start, end); equal start and end mean all day.
 */
export function isWithinSchedule(
  start: number,
  end: number,
  now: number,
): boolean {
  if (start === end) return true;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

/**
 * @param conditions - The current conditions.
 * @returns Whether a condition can change with time alone (idle, the
 *   schedule), so the
 *   policy must re-check on a timer while mining is started.
 */
export function needsPeriodicCheck(conditions: MiningConditions): boolean {
  return (
    conditions.isEnabled && (conditions.idleOnly || conditions.isScheduled)
  );
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
    conditions.isScheduled &&
    !isWithinSchedule(
      conditions.scheduleStartMinutes,
      conditions.scheduleEndMinutes,
      conditions.nowMinutes,
    )
  ) {
    return MiningPowerStatus.PAUSED_SCHEDULE;
  }
  if (
    conditions.idleOnly &&
    conditions.idleSeconds < conditions.idleThresholdSeconds
  ) {
    return MiningPowerStatus.PAUSED_USER_ACTIVE;
  }
  return MiningPowerStatus.MINING;
}
