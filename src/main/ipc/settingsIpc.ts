import { ipcMain } from "electron";
import { broadcastWalletState } from "../services/extensionSyncServer";
import { getRpcPort } from "../geth/ports";
import type { AppStore } from "../services/appStore";

/**
 * Registers the settings read/write handlers. Changing the active wallet or
 * network re-broadcasts wallet state to the paired extension.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {void}
 */
export function registerSettingsHandlers(store: AppStore): void {
  ipcMain.handle("settings:get", (_, key) => store.get(key));
  ipcMain.handle("settings:set", (_, key, value) => {
    store.set(key, value);
    if (key === "activeWalletAddress" || key === "network.network") {
      void broadcastWalletState(store, getRpcPort());
    }
  });
  ipcMain.handle("settings:getAll", () => store.store);
}
