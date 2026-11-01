import ms from "ms";

const SESSION_DURATION_MS = ms("7d");

let sessionStartTimestamp: number = Date.now();

/**
 * Restarts the session window from now; called once the app is ready.
 * @returns {void}
 */
export function startSession(): void {
  sessionStartTimestamp = Date.now();
}

/**
 * Validates whether the current session is within the allowed duration window.
 * @returns True if the session has not exceeded SESSION_DURATION_MS.
 */
export function isSessionValid(): boolean {
  const elapsed = Date.now() - sessionStartTimestamp;
  return elapsed < SESSION_DURATION_MS;
}
