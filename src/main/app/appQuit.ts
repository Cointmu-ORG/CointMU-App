import { app } from "electron";
import { killGethProcess } from "../geth/process/gethProcess";
import { removeTemporaryIpcDir } from "../geth/process/ipcEndpointLifecycle";

let isQuitting = false;

/** @returns True once a quit has started; the window then closes for real. */
export function isQuitInProgress(): boolean {
  return isQuitting;
}

/**
 * Intercepts the quit sequence so the app does not terminate until the geth
 * child process has been given a chance to persist its chain state to disk.
 * Every quit goes through here: the title bar, the tray's Quit, the OS.
 */
export function registerQuitHandler(): void {
  app.on("before-quit", (e) => {
    if (isQuitting) {
      return;
    }
    e.preventDefault();
    isQuitting = true;
    killGethProcess()
      .then(removeTemporaryIpcDir)
      .then(() => {
        app.exit();
      });
  });
}
