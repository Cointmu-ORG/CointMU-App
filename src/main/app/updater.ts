import { app, ipcMain, type BrowserWindow } from "electron";
import {
  autoUpdater,
  type UpdateInfo,
  type ProgressInfo,
} from "electron-updater";
import { is } from "@electron-toolkit/utils";
import { killGethProcess } from "../geth/process/gethProcess";
import { UpdateInstallMode } from "../../bridge/setting-values";
import type { AppStore } from "../store/appStore";
import { QuitReason, markQuitReason, setQuitFinisher } from "./appQuit";

// If the installer does not end the app, it still has to exit: geth is gone.
const INSTALL_EXIT_FALLBACK_MS = 10_000;

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
  /** downloaded only: show the "Restart now" prompt (install mode Ask). */
  shouldAskToInstall?: boolean;
}

/**
 * Stops geth, then quits and installs the downloaded update. On Windows the
 * installer terminates every process under the install folder, geth.exe
 * included, about a second after it starts: long before before-quit has let
 * geth shut down, which would leave its database unclean (#97). The quit it
 * starts is marked as the updater's, so it is never held for confirmation.
 * @returns {Promise<void>} Resolves once the install has been started.
 */
async function stopGethAndInstall(): Promise<void> {
  // The install must not wait on the quit confirmation.
  markQuitReason(QuitReason.UPDATER);
  await killGethProcess();
  autoUpdater.quitAndInstall();
}

/**
 * Installs a waiting update while the app quits (install mode "on quit").
 * Runs from the quit sequence after geth has stopped, so no relaunch.
 * @param isUpdateReady - Whether an update was downloaded.
 * @param store - The settings store.
 */
function finishQuit(isUpdateReady: boolean, store: AppStore): void {
  const mode = store.get("updates.installMode");
  if (!isUpdateReady || mode !== UpdateInstallMode.ON_QUIT) {
    app.exit();
    return;
  }
  console.log("[updater] Installing the downloaded update on quit");
  autoUpdater.quitAndInstall(true, false);
  setTimeout(() => app.exit(), INSTALL_EXIT_FALLBACK_MS);
}

/**
 * Initializes the Electron auto-updater with automatic download enabled and
 * wires its lifecycle events and renderer-facing IPC handlers. A downloaded
 * update waits: it is installed when the user quits (install mode "on quit")
 * or when they choose Restart now (mode "ask" shows that prompt). The check
 * at start runs only while Settings → General → Updates allows it.
 * @param {BrowserWindow} mainWindow - The main BrowserWindow used to forward update events.
 * @param store - The settings store (updates.autoCheck, updates.installMode).
 * @returns {void}
 */
function initUpdater(mainWindow: BrowserWindow, store: AppStore): void {
  let isUpdateReady = false;
  setQuitFinisher(() => finishQuit(isUpdateReady, store));
  // The quit sequence installs it itself, after geth has stopped.
  autoUpdater.autoInstallOnAppQuit = false;
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
    console.log(`[updater] Update downloaded: ${info.version}`);
    isUpdateReady = true;
    send({
      status: "downloaded",
      info: { version: info.version },
      shouldAskToInstall:
        store.get("updates.installMode") === UpdateInstallMode.ASK,
    });
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

  ipcMain.handle("updater:install", () => stopGethAndInstall());

  if (store.get("updates.autoCheck") === false) {
    console.log("[updater] Automatic update check is off.");
  } else if (app.isPackaged) {
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
