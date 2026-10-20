import { app, ipcMain, type BrowserWindow } from "electron";
import {
  autoUpdater,
  type UpdateInfo,
  type ProgressInfo,
} from "electron-updater";
import { is } from "@electron-toolkit/utils";

/**
 * Structured update lifecycle payload forwarded to the renderer over the
 * 'updater:state' channel. Only the fields relevant to the current status are
 * populated so the renderer can normalize them into its reactive state.
 */
interface UpdaterStatePayload {
  status:
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  info?: { version: string };
  progress?: {
    percent: number;
    transferred: number;
    total: number;
    bytesPerSecond: number;
  };
  error?: string;
}

/**
 * Initializes the Electron auto-updater with automatic download enabled and
 * wires its lifecycle events and renderer-facing IPC handlers. When an update
 * is downloaded it is installed immediately via quitAndInstall, restarting the
 * application on the new version.
 * @param {BrowserWindow} mainWindow - The main BrowserWindow used to forward update events.
 * @returns {void}
 */
function initUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = true;
  autoUpdater.logger = console;
  autoUpdater.allowPrerelease = true;
  autoUpdater.allowDowngrade = false;

  /**
   * Sends a structured updater state payload to the renderer process.
   * @param {UpdaterStatePayload} payload - The update lifecycle payload to send.
   * @returns {void}
   */
  const send = (payload: UpdaterStatePayload): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:state", payload);
    }
  };

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] Checking for update...");
    send({ status: "checking" });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    console.log(`[updater] Update available: ${info.version}`);
    send({ status: "available", info: { version: info.version } });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    console.log(
      `[updater] Update not available. Current version: ${info.version}`,
    );
    send({ status: "not-available" });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    console.log(
      `[updater] Download progress: ${progress.percent.toFixed(1)}% at ${progress.bytesPerSecond} B/s`,
    );
    send({
      status: "downloading",
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      },
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    console.log(
      `[updater] Update downloaded: ${info.version}. Restarting to apply update.`,
    );
    send({ status: "downloaded", info: { version: info.version } });
    autoUpdater.quitAndInstall();
  });

  autoUpdater.on("error", (err: Error) => {
    const message = err == null ? "Unknown update error" : err.message;
    console.error(`[updater] Error: ${message}`);
    send({ status: "error", error: message });
  });

  ipcMain.handle("updater:check", async () => {
    if (!app.isPackaged && !is.dev) {
      console.warn("[updater] Skipping update check in development mode.");
      send({ status: "not-available" });
      return;
    }
    try {
      if (is.dev) {
        autoUpdater.forceDevUpdateConfig = true;
      }
      await autoUpdater.checkForUpdates();
    } catch (err) {
      send({ status: "error", error: (err as Error).message });
    }
  });

  ipcMain.handle("updater:download", async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      send({ status: "error", error: (err as Error).message });
    }
  });

  ipcMain.handle("updater:install", () => {
    autoUpdater.quitAndInstall();
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      console.error("[updater] Initial update check failed:", err.message);
    });
  } else if (is.dev) {
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      console.error(
        "[updater] Initial development update check failed:",
        err.message,
      );
    });
  } else {
    console.warn("[updater] Development mode: automatic update check skipped.");
  }
}

export { initUpdater };
