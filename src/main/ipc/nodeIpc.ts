import { ipcMain } from "electron";
import { NODE_CHANNELS } from "../../bridge/ipc-channels";
import { getRpcPort } from "../geth/ports";
import { getNetworkId, resolveDataDir } from "../geth/networkConfig";
import { initGethIfNeeded } from "../geth/gethInit";
import {
  NODE_RESTART_DELAY_MS,
  getNodeRecovery,
  isGethRunning,
  killGethProcess,
  spawnGethProcess,
} from "../geth/gethProcess";
import { isSessionValid } from "../services/session";
import type { AppStore } from "../services/appStore";

/**
 * Registers the RPC port and node status queries. Safe before startup resolves
 * the ports; they report the defaults until then.
 * @returns {void}
 */
export function registerNodeStatusHandlers(): void {
  ipcMain.handle("get-rpc-port", () => getRpcPort());
  ipcMain.handle("get-node-status", () => ({
    running: isGethRunning(),
    port: getRpcPort(),
    sessionValid: isSessionValid(),
    networkId: getNetworkId(),
  }));
}

/**
 * Inits genesis when the datadir has none, then spawns geth. A retry after a
 * blocked first start (e.g. Rosetta installed afterwards) must not let geth
 * fill an empty datadir with its default mainnet genesis.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {Promise<void>}
 */
async function initAndSpawnGeth(store: AppStore): Promise<void> {
  try {
    await initGethIfNeeded(resolveDataDir());
  } catch (err) {
    console.error("[geth:init] Genesis init failed before restart:", err);
  }
  await spawnGethProcess(store);
}

/**
 * Registers the user-driven node restart and the recovery state query.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {void}
 */
export function registerNodeControlHandlers(store: AppStore): void {
  /**
   * Restarts geth on a user action, clearing any blocked or failed recovery
   * state first. Skipped while a recovery owns the node lifecycle.
   * @returns {void}
   */
  const restartNodeByUser = (): void => {
    const nodeRecovery = getNodeRecovery();
    if (nodeRecovery && !nodeRecovery.resume()) return;
    console.log("[network] Restarting node with new configurations...");
    killGethProcess().then(() => {
      setTimeout(() => {
        void initAndSpawnGeth(store);
      }, NODE_RESTART_DELAY_MS);
    });
  };

  ipcMain.on("network:restartNode", restartNodeByUser);
  ipcMain.handle(NODE_CHANNELS.RETRY, restartNodeByUser);
  ipcMain.handle(
    NODE_CHANNELS.GET_RECOVERY_STATE,
    () => getNodeRecovery()?.getActiveEvent() ?? null,
  );
}
