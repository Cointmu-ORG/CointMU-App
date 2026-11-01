import { ipcMain } from "electron";
import { broadcastWalletState } from "../extension/extensionSyncServer";
import { getRpcPort } from "../geth/process/ports";
import { isBootnodeSettingKey } from "../geth/bootnode/bootnodeSettings";
import type { AppStore } from "../store/appStore";

/**
 * Registers the settings read/write handlers. Changing the active wallet
 * re-broadcasts wallet state to the paired extension. Writes that
 * would bypass a dedicated, validated channel (the bootnode list) are refused.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {void}
 */
export function registerSettingsHandlers(store: AppStore): void {
  ipcMain.handle("settings:get", (_, key) => store.get(key));
  ipcMain.handle("settings:set", (_, key: unknown, value: unknown) => {
    // electron-store also accepts an object of many keys; only one dotted key is allowed here.
    if (typeof key !== "string") {
      throw new TypeError("settings:set expects a string key");
    }
    if (isBootnodeSettingKey(key)) {
      throw new Error(
        `settings:set cannot write "${key}"; use the bootnode settings channel`,
      );
    }
    store.set(key, value);
    if (key === "activeWalletAddress") {
      void broadcastWalletState(store, getRpcPort());
    }
  });
  ipcMain.handle("settings:getAll", () => store.store);
}
