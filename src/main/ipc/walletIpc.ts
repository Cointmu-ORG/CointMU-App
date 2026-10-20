import { ipcMain, dialog } from "electron";
import { writeFileSync } from "fs";
import { readFile } from "fs/promises";
import type { AppStore } from "../services/appStore";

/**
 * Registers keystore export/import dialogs and the wipe of stored wallet data.
 * @param {AppStore} store - The electron-store instance holding the wallet.
 * @returns {void}
 */
export function registerWalletHandlers(store: AppStore): void {
  ipcMain.handle(
    "dialog:saveKeystore",
    async (_, keystoreJson: string, filename: string) => {
      const result = await dialog.showSaveDialog({
        title: "Export Keystore",
        defaultPath: filename,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      try {
        writeFileSync(result.filePath, keystoreJson, "utf8");
        return { success: true, path: result.filePath };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle("wallet:clearAllData", () => {
    try {
      store.set("encryptedPayload", null);
      store.set("mnemonic", null);
      store.set("activeWalletAddress", null);
      store.set("accounts", []);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle("app:openKeystore", async () => {
    const result = await dialog.showOpenDialog({
      title: "Import Keystore",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    try {
      const data = await readFile(result.filePaths[0], "utf8");
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}
