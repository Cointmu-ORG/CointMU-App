import type { DialogText } from "@bridge/types";

/**
 * Opens the folder holding main.log and geth.log in the OS file manager.
 * @returns A promise resolving once the folder was opened.
 */
async function openLogsFolder(): Promise<void> {
  return window.api.diagnostics.openLogsFolder();
}

/**
 * Copies the last lines of the app and node logs, sanitized, to the clipboard.
 * @returns The number of characters copied.
 */
async function copyRecentLogs(): Promise<number> {
  return window.api.diagnostics.copyRecentLogs();
}

/**
 * Asks where to save, then writes the sanitized diagnostic bundle (logs,
 * versions, non-secret settings) as a ZIP.
 * @param dialogText - The save dialog text in the UI language.
 * @returns True once saved, false when the dialog was cancelled.
 */
async function exportDiagnosticBundle(
  dialogText: DialogText,
): Promise<boolean> {
  return window.api.diagnostics.exportBundle(dialogText);
}

export { openLogsFolder, copyRecentLogs, exportDiagnosticBundle };
