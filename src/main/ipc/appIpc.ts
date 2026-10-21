import { app, shell, ipcMain, dialog } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { copyFile } from "fs/promises";
import { resolveDataDir } from "../geth/networkConfig";
import { getDirectorySize } from "../services/directorySize";

/**
 * Registers the app file handlers: the extension ZIP export and the chain data
 * directory location, size and folder.
 * @returns {void}
 */
export function registerAppHandlers(): void {
  ipcMain.handle("export-extension-zip", async () => {
    const sourcePath = app.isPackaged
      ? join(process.resourcesPath, "extension.zip")
      : join(app.getAppPath(), "resources", "extension.zip");

    if (!existsSync(sourcePath)) {
      console.error("[export] Extension ZIP not found at:", sourcePath);
      return false;
    }

    const result = await dialog.showSaveDialog({
      title: "Export Companion Browser Extension",
      defaultPath: "CointMU-Extension.zip",
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    });

    if (result.canceled || !result.filePath) {
      return false;
    }

    try {
      await copyFile(sourcePath, result.filePath);
      return true;
    } catch (err) {
      console.error("[export] Failed to copy extension ZIP:", err);
      return false;
    }
  });

  ipcMain.handle("app:getDatadir", () => resolveDataDir());

  ipcMain.handle("app:getChainDbSize", async () => {
    try {
      return await getDirectorySize(
        join(resolveDataDir(), "geth", "chaindata"),
      );
    } catch {
      return 0;
    }
  });

  ipcMain.handle("app:openDataFolder", () => shell.openPath(resolveDataDir()));
}
