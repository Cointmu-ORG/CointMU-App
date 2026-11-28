import { app, ipcMain, shell, type BrowserWindow } from "electron";
import { is } from "@electron-toolkit/utils";
import type { AppStore } from "../store/appStore";
import { setQuitFinisher } from "./appQuit";
import {
  LATEST_RELEASE_PAGE,
  fetchNewerMacRelease,
  isAllowedReleasePageUrl,
} from "./macReleaseCheck";

/** The 'updater:state' events this mode sends; a subset of updater.ts's. */
type NoticePayload =
  | { status: "checking" | "not-available" }
  | {
      status: "available";
      info: { version: string };
      /** Install by hand from the release page; nothing is downloaded. */
      isManualInstall: true;
    }
  | { status: "error"; error: string };

/**
 * Opens a release page in the browser, if it is one the notice may open.
 * @param url - The page to open.
 */
async function openReleasePage(url: string): Promise<void> {
  if (!isAllowedReleasePageUrl(url)) {
    console.error(`[updater] Refusing to open ${url}: not a release page`);
    return;
  }
  await shell.openExternal(url);
}

/**
 * Updates on a macOS build that is not notarized (#164): such a build cannot
 * replace itself, and electron-updater would download, stage and install
 * anyway. This only checks the latest GitHub release and tells the renderer
 * about a newer one, whose page the user opens to install it by hand.
 * Nothing is downloaded, installed or written to disk; download and install
 * requests are ignored.
 * @param mainWindow - Receives the 'updater:state' events.
 * @param store - The settings store (updates.autoCheck).
 */
export function initMacUpdateNotice(
  mainWindow: BrowserWindow,
  store: AppStore,
): void {
  // Nothing is ever waiting to install, so a quit just exits.
  setQuitFinisher(() => app.exit());
  let pageUrl = LATEST_RELEASE_PAGE;

  const send = (payload: NoticePayload): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:state", payload);
    }
  };

  const check = async (): Promise<void> => {
    send({ status: "checking" });
    try {
      const release = await fetchNewerMacRelease(app.getVersion());
      if (!release) {
        send({ status: "not-available" });
        return;
      }
      console.log(`[updater] Update available: ${release.version}`);
      pageUrl = release.pageUrl;
      send({
        status: "available",
        info: { version: release.version },
        isManualInstall: true,
      });
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[updater] Update check failed: ${message}`);
      send({ status: "error", error: message });
    }
  };

  const canCheck = app.isPackaged || is.dev;

  ipcMain.handle("updater:check", async () => {
    if (!canCheck) {
      console.warn("[updater] Skipping update check in development mode.");
      send({ status: "not-available" });
      return;
    }
    await check();
  });
  ipcMain.handle("updater:download", () => {
    console.warn("[updater] macOS updates are installed by hand; no download");
  });
  ipcMain.handle("updater:install", () => {
    console.warn("[updater] macOS updates are installed by hand; no install");
  });
  ipcMain.handle("updater:openReleasePage", () => openReleasePage(pageUrl));

  if (store.get("updates.autoCheck") === false) {
    console.log("[updater] Automatic update check is off.");
  } else if (canCheck) {
    void check();
  } else {
    console.warn("[updater] Development mode: automatic update check skipped.");
  }
}
