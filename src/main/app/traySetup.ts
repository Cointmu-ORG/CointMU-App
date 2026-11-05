import { app, type BrowserWindow } from "electron";
import { CloseAction } from "../../bridge/setting-values";
import { readNodeStatus } from "../geth/rpc/nodeStatus";
import { getRpcPort } from "../geth/process/ports";
import type { MiningController } from "../mining/miningController";
import type { AppStore } from "../store/appStore";
import { hideTray, showTray, type TrayActions } from "./tray";
import { detectTraySupport } from "./traySupport";

const CLOSE_ACTION_KEY = "general.closeAction";

/**
 * @param win - The main window.
 */
function showWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/**
 * Shows the tray while the close button is set to hide to the tray, and only
 * where a tray can be shown; elsewhere close quits (the window's close
 * handler only hides it while the tray is shown).
 * @param store - The settings store.
 * @param win - The main window.
 * @param mining - Starts and stops mining for the tray menu.
 * @returns Resolves to whether this desktop supports a tray.
 */
export async function setupTray(
  store: AppStore,
  win: BrowserWindow,
  mining: MiningController,
): Promise<boolean> {
  const isSupported = await detectTraySupport(process.platform);
  const actions: TrayActions = {
    showWindow: () => showWindow(win),
    isMiningEnabled: () => mining.isEnabled(),
    setMiningEnabled: (enabled) => mining.setEnabled(enabled),
    readStatus: () => readNodeStatus(getRpcPort()),
    quit: () => app.quit(),
  };
  const apply = (): void => {
    const isWanted = store.get(CLOSE_ACTION_KEY) === CloseAction.TRAY;
    if (isSupported && isWanted) showTray(actions);
    else hideTray();
  };
  apply();
  store.onDidChange(CLOSE_ACTION_KEY, apply);
  return isSupported;
}
