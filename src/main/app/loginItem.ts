import { app } from "electron";
import type { AppStore } from "../store/appStore";

// Added to the Windows login entry when Open in background is on; a launch
// that carries it starts minimized.
const BACKGROUND_ARG = "--open-in-background";

/**
 * Login items exist on Windows and macOS only, and only for the installed app:
 * in development the entry would start a bare Electron.
 * @returns True when the login item settings apply.
 */
function isLoginItemSupported(): boolean {
  return (
    app.isPackaged &&
    (process.platform === "win32" || process.platform === "darwin")
  );
}

function loginItemArgs(store: AppStore): string[] {
  return process.platform === "win32" && store.get("general.openInBackground")
    ? [BACKGROUND_ARG]
    : [];
}

/**
 * Makes Launch at login show what the OS will do. The setting was saved but
 * never applied up to 1.7.4, so its stored default (on) is not trusted: the OS
 * entry is.
 * @param store - The settings store.
 * @returns {void}
 */
export function syncLoginItemFromOs(store: AppStore): void {
  if (!isLoginItemSupported()) return;
  const { openAtLogin } = app.getLoginItemSettings({
    args: loginItemArgs(store),
  });
  store.set("general.launchAtLogin", openAtLogin);
}

/**
 * Writes Launch at login and Open in background (Windows) to the OS.
 * @param store - The settings store.
 * @returns {void}
 */
export function applyLoginItem(store: AppStore): void {
  if (!isLoginItemSupported()) return;
  app.setLoginItemSettings({
    openAtLogin: Boolean(store.get("general.launchAtLogin")),
    args: loginItemArgs(store),
  });
}

/** @returns True when Windows started this instance from the background login entry. */
export function wasOpenedInBackground(): boolean {
  return process.argv.includes(BACKGROUND_ARG);
}
