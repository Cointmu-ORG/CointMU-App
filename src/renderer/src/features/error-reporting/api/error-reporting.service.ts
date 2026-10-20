import type { QueuedReport, TelemetryState } from "@bridge/types";

/**
 * Reads whether error reporting is configured, enabled, and acknowledged.
 * @returns The current reporting state.
 */
async function getTelemetryState(): Promise<TelemetryState> {
  return window.api.diagnostics.getTelemetryState();
}

/**
 * Turns error reporting on or off. Off also deletes queued reports.
 * @param isEnabled - The new choice.
 * @returns The updated reporting state.
 */
async function setTelemetryEnabled(
  isEnabled: boolean,
): Promise<TelemetryState> {
  return window.api.diagnostics.setTelemetryEnabled(isEnabled);
}

/**
 * Records that the first-run notice was seen; queued reports may now be sent.
 * @returns The updated reporting state.
 */
async function acknowledgeTelemetryNotice(): Promise<TelemetryState> {
  return window.api.diagnostics.acknowledgeNotice();
}

/**
 * Lists the sanitized reports waiting to be sent, oldest first.
 * @returns The queued reports.
 */
async function listQueuedReports(): Promise<QueuedReport[]> {
  return window.api.diagnostics.listQueuedReports();
}

/**
 * Deletes every report waiting to be sent.
 * @returns A promise resolving once the queue is empty.
 */
async function clearQueuedReports(): Promise<void> {
  return window.api.diagnostics.clearQueuedReports();
}

export {
  getTelemetryState,
  setTelemetryEnabled,
  acknowledgeTelemetryNotice,
  listQueuedReports,
  clearQueuedReports,
};
