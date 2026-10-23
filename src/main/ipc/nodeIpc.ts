import { ipcMain } from "electron";
import { NODE_CHANNELS } from "../../bridge/ipc-channels";
import { getRpcPort } from "../geth/ports";
import { getNetworkId } from "../geth/networkConfig";
import {
  NODE_RESTART_DELAY_MS,
  getNodeRecovery,
  isGethRunning,
  killGethProcess,
  spawnGethProcess,
} from "../geth/gethProcess";
import { isSessionValid } from "../services/session";
import { peerWatchdog } from "../geth/nodeRecovery";
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
  ipcMain.handle(NODE_CHANNELS.GET_PEER_HINT, () => peerWatchdog.getHint());
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
        void spawnGethProcess(store);
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
