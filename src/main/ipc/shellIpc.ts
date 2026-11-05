import { ipcMain } from "electron";
import { SHELL_CHANNELS } from "../../bridge/ipc-channels";
import type { ShellCapabilities } from "../../bridge/types";
import { parseShellText, setShellText } from "../app/shellText";

/**
 * Registers the shell channels: the localized tray text the renderer sends,
 * and what the desktop supports.
 * @param traySupport - Resolves to whether a tray can be shown here.
 */
export function registerShellHandlers(traySupport: Promise<boolean>): void {
  ipcMain.handle(SHELL_CHANNELS.SET_TEXT, (_, payload: unknown) => {
    const text = parseShellText(payload);
    if (!text) throw new TypeError("shell:set-text expects a ShellText object");
    setShellText(text);
  });
  ipcMain.handle(
    SHELL_CHANNELS.GET_CAPABILITIES,
    async (): Promise<ShellCapabilities> => ({
      isTraySupported: await traySupport,
    }),
  );
}
