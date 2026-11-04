import { ipcMain } from "electron";
import { broadcastWalletState } from "../extension/extensionSyncServer";
import { getRpcPort } from "../geth/process/ports";
import { isBootnodeSettingKey } from "../geth/bootnode/bootnodeSettings";
import { restartNodeByUser } from "../geth/process/nodeRestart";
import { applyLoginItem } from "../app/loginItem";
import type { AppStore } from "../store/appStore";

// Read when geth starts (spawnGethProcess); saving a new value restarts it.
const GETH_SETTING_KEYS = [
  "network.listenPort",
  "network.maxPeers",
  "advanced.logLevel",
] as const;
const LOGIN_ITEM_SETTING_KEYS = [
  "general.launchAtLogin",
  "general.openInBackground",
] as const;

/**
 * Snapshots a few dotted keys, so a write of a whole section (as "Reset all
 * settings" and the advanced store do) is compared too.
 */
function readSettings(store: AppStore, keys: readonly string[]): string {
  return JSON.stringify(keys.map((key) => store.get(key)));
}

/**
 * Registers the settings read/write handlers. Changing the active wallet
 * re-broadcasts wallet state to the paired extension, changing a setting
 * geth starts with restarts the node, and the login item settings are written
 * to the OS. Writes that
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
    const gethSettingsBefore = readSettings(store, GETH_SETTING_KEYS);
    const loginItemBefore = readSettings(store, LOGIN_ITEM_SETTING_KEYS);
    store.set(key, value);
    if (readSettings(store, GETH_SETTING_KEYS) !== gethSettingsBefore) {
      restartNodeByUser(store);
    }
    if (readSettings(store, LOGIN_ITEM_SETTING_KEYS) !== loginItemBefore) {
      applyLoginItem(store);
    }
    if (key === "activeWalletAddress") {
      void broadcastWalletState(store, getRpcPort());
    }
  });
  ipcMain.handle("settings:getAll", () => store.store);
}
