import type { BrowserWindow } from "electron";
import type { AppStore } from "../store/appStore";

const ZOOM_KEY = "appearance.zoomPercent";
const DEFAULT_ZOOM_PERCENT = 100;
const PERCENT = 100;

/**
 * Applies the stored zoom (Settings → Appearance) to the window now, after
 * every page load, and whenever the setting changes. No keyboard shortcut is
 * added for it.
 * @param store - The settings store; settings:set validates the value.
 * @param win - The main window.
 */
export function applyStoredZoom(store: AppStore, win: BrowserWindow): void {
  const apply = (): void => {
    if (win.isDestroyed()) return;
    const stored: unknown = store.get(ZOOM_KEY);
    const percent = typeof stored === "number" ? stored : DEFAULT_ZOOM_PERCENT;
    win.webContents.setZoomFactor(percent / PERCENT);
  };
  apply();
  win.webContents.on("did-finish-load", apply);
  store.onDidChange(ZOOM_KEY, apply);
}
