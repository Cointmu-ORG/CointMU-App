import { BrowserWindow, ipcMain } from "electron";

/**
 * Registers the frameless-window controls sent from the custom title bar.
 * @returns {void}
 */
export function registerWindowHandlers(): void {
  ipcMain.on("window-minimize", (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    if (win) {
      win.minimize();
    }
  });

  ipcMain.on("window-close", (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    if (win) {
      win.close();
    }
  });
}
