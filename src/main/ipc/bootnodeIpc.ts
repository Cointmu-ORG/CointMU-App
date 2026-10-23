import { ipcMain } from "electron";
import { BOOTNODE_CHANNELS } from "../../bridge/ipc-channels";
import type { BootnodeSaveResult, BootnodeState } from "../../bridge/types";
import {
  BOOTNODES_SETTING_KEY,
  buildBootnodeState,
  checkBootnodeInput,
  hasSameEnodes,
} from "../geth/bootnodeSettings";
import {
  DEFAULT_BOOTNODE_CONFIG,
  getActiveBootnodeConfig,
} from "../geth/bootnodeWatcher";
import { restartNodeByUser } from "../geth/nodeRestart";
import type { AppStore } from "../services/appStore";

/**
 * Restarts the node so it dials the saved bootnodes, then describes the
 * result. When a recovery owns the node the restart is skipped and the state
 * reports it as pending.
 */
function applyBootnodeChange(store: AppStore): BootnodeState {
  const isRestarting = restartNodeByUser(store);
  const running = isRestarting ? null : getActiveBootnodeConfig();
  return buildBootnodeState(store, DEFAULT_BOOTNODE_CONFIG, running);
}

/**
 * Registers the bootnode setting handlers. Every entry is validated here, in
 * main; a rejected list leaves the saved one (and the running node) untouched.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {void}
 */
export function registerBootnodeHandlers(store: AppStore): void {
  ipcMain.handle(BOOTNODE_CHANNELS.GET, () =>
    buildBootnodeState(
      store,
      DEFAULT_BOOTNODE_CONFIG,
      getActiveBootnodeConfig(),
    ),
  );
  ipcMain.handle(
    BOOTNODE_CHANNELS.SET,
    (_, input: unknown): BootnodeSaveResult => {
      const check = checkBootnodeInput(input);
      if (!check.isValid) {
        console.warn(`[bootnode] Rejected custom bootnodes (${check.error})`);
        return { isSaved: false, error: check.error, invalid: check.invalid };
      }
      store.set(BOOTNODES_SETTING_KEY, check.enodes);
      console.log(`[bootnode] Saved ${check.enodes.length} custom bootnode(s)`);
      return { isSaved: true, state: applyBootnodeChange(store) };
    },
  );
  ipcMain.handle(BOOTNODE_CHANNELS.RESET, (): BootnodeState => {
    store.set(BOOTNODES_SETTING_KEY, []);
    console.log("[bootnode] Reset to the default bootnodes");
    const running = getActiveBootnodeConfig();
    // "Reset all settings" always calls this; skip the restart when the
    // running node (or a node not started yet) already uses the defaults.
    const isAlreadyDefault =
      running === null ||
      hasSameEnodes(running.enodes, DEFAULT_BOOTNODE_CONFIG.enodes);
    if (isAlreadyDefault) {
      return buildBootnodeState(store, DEFAULT_BOOTNODE_CONFIG, running);
    }
    return applyBootnodeChange(store);
  });
}
