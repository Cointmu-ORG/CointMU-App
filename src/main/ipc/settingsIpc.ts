import { ipcMain } from "electron";
import { broadcastWalletState } from "../extension/extensionSyncServer";
import { getRpcPort } from "../geth/process/ports";
import { isBootnodeSettingKey } from "../geth/bootnode/bootnodeSettings";
import { restartNodeByUser } from "../geth/process/nodeRestart";
import type { AppStore } from "../store/appStore";

// Read when geth starts (spawnGethProcess); saving a new value restarts it.
const GETH_SETTING_KEYS = ["network.listenPort"] as const;

function readGethSettings(store: AppStore): string {
  return JSON.stringify(GETH_SETTING_KEYS.map((key) => store.get(key)));
}

/**
 * Registers the settings read/write handlers. Changing the active wallet
 * re-broadcasts wallet state to the paired extension, and changing a setting
 * geth starts with restarts the node. Writes that
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
    const gethSettingsBefore = readGethSettings(store);
    store.set(key, value);
    if (readGethSettings(store) !== gethSettingsBefore) {
      restartNodeByUser(store);
    }
    if (key === "activeWalletAddress") {
      void broadcastWalletState(store, getRpcPort());
    }
  });
  ipcMain.handle("settings:getAll", () => store.store);
}
