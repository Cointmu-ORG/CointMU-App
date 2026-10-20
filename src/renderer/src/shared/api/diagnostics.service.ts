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

export { openLogsFolder, copyRecentLogs };
