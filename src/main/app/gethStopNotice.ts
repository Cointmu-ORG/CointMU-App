import type { BrowserWindow } from "electron";
import { NODE_CHANNELS } from "../../bridge/ipc-channels";
import { onGethStopWait } from "../geth/process/gethStopWait";
import { isSessionEnding } from "./appQuit";
import { setTrayStopWaiting } from "./tray";
import { showWindow } from "./traySetup";

/**
 * Shows a stop that waits for geth's startup repair (gethStopWait.ts): the
 * renderer's overlay, brought up when the window is hidden in the tray or
 * minimized, and the tray status. Skipped while the OS session ends: the OS
 * does not wait for it.
 * @param win - The main window.
 * @returns Stops showing it.
 */
export function showGethStopWait(win: BrowserWindow): () => void {
  return onGethStopWait((wait) => {
    if (isSessionEnding()) return;
    setTrayStopWaiting(wait !== null);
    if (win.isDestroyed()) return;
    win.webContents.send(NODE_CHANNELS.STOP_WAIT, wait);
    if (wait && (!win.isVisible() || win.isMinimized())) showWindow(win);
  });
}
