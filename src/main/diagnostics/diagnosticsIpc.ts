import { ipcMain } from "electron";
import { DIAGNOSTICS_CHANNELS } from "../../bridge/ipc-channels";
import type { TelemetryState } from "../../bridge/types";
import {
  applyTelemetryConsent,
  clearQueuedReports,
  getTelemetryAvailability,
  listQueuedReports,
} from "./errorReporting";
import { copyRecentLogs, openLogsFolder } from "./logging";
import {
  TELEMETRY_ENABLED_KEY,
  TELEMETRY_NOTICE_KEY,
  readConsent,
  type SettingsReader,
} from "./telemetryConsent";

export interface SettingsStore extends SettingsReader {
  set(key: string, value: unknown): void;
}

function readTelemetryState(store: SettingsReader): TelemetryState {
  const consent = readConsent(store);
  return {
    ...getTelemetryAvailability(),
    isEnabled: consent.isEnabled === true,
    isNoticeAcknowledged: consent.isNoticeAcknowledged,
  };
}

function updateConsent(
  store: SettingsStore,
  key: string,
  value: boolean,
): TelemetryState {
  store.set(key, value);
  applyTelemetryConsent(readConsent(store));
  return readTelemetryState(store);
}

/**
 * Applies the stored reporting choice and registers the log and reporting IPC
 * handlers. Call once, after the settings store is loaded.
 * @param store - The electron-store instance.
 */
export function registerDiagnosticsHandlers(store: SettingsStore): void {
  applyTelemetryConsent(readConsent(store));

  ipcMain.handle(DIAGNOSTICS_CHANNELS.OPEN_LOGS_FOLDER, () => openLogsFolder());
  ipcMain.handle(DIAGNOSTICS_CHANNELS.COPY_RECENT_LOGS, () => copyRecentLogs());
  ipcMain.handle(DIAGNOSTICS_CHANNELS.GET_TELEMETRY_STATE, () =>
    readTelemetryState(store),
  );
  ipcMain.handle(
    DIAGNOSTICS_CHANNELS.SET_TELEMETRY_ENABLED,
    (_, isEnabled: unknown) => {
      if (typeof isEnabled !== "boolean") {
        throw new TypeError(
          `${DIAGNOSTICS_CHANNELS.SET_TELEMETRY_ENABLED} expects a boolean`,
        );
      }
      return updateConsent(store, TELEMETRY_ENABLED_KEY, isEnabled);
    },
  );
  ipcMain.handle(DIAGNOSTICS_CHANNELS.ACKNOWLEDGE_NOTICE, () =>
    updateConsent(store, TELEMETRY_NOTICE_KEY, true),
  );
  ipcMain.handle(DIAGNOSTICS_CHANNELS.LIST_QUEUED_REPORTS, () =>
    listQueuedReports(),
  );
  ipcMain.handle(DIAGNOSTICS_CHANNELS.CLEAR_QUEUED_REPORTS, () =>
    clearQueuedReports(),
  );
}
