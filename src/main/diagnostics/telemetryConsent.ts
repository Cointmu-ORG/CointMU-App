export const TELEMETRY_ENABLED_KEY = "telemetry.enabled";
export const TELEMETRY_NOTICE_KEY = "telemetry.noticeAcknowledged";

/**
 * The user's reporting choice. `isEnabled` is null until the settings store has
 * loaded, so errors from early startup can be queued but not sent.
 */
export interface ConsentState {
  readonly isEnabled: boolean | null;
  readonly isNoticeAcknowledged: boolean;
}

export interface SettingsReader {
  get(key: string): unknown;
}

export const UNKNOWN_CONSENT: ConsentState = {
  isEnabled: null,
  isNoticeAcknowledged: false,
};

/**
 * Reads the opt-out choice: reporting is on unless the user turned it off.
 * @param store - The settings store.
 * @returns The current consent state.
 */
export function readConsent(store: SettingsReader): ConsentState {
  return {
    isEnabled: store.get(TELEMETRY_ENABLED_KEY) !== false,
    isNoticeAcknowledged: store.get(TELEMETRY_NOTICE_KEY) === true,
  };
}

/** @returns True while an error may be captured into the local queue. */
export function canCapture(consent: ConsentState): boolean {
  return consent.isEnabled !== false;
}

/** @returns True only once reporting is on and the first-run notice was seen. */
export function canSend(consent: ConsentState): boolean {
  return consent.isEnabled === true && consent.isNoticeAcknowledged;
}
