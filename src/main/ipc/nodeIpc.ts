import { ipcMain } from "electron";
import { NODE_CHANNELS } from "../../bridge/ipc-channels";
import { getRpcPort } from "../geth/ports";
import { getNetworkId } from "../geth/networkConfig";
import { getNodeRecovery, isGethRunning } from "../geth/gethProcess";
import { restartNodeByUser } from "../geth/nodeRestart";
import { isSessionValid } from "../app/session";
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
  const restart = (): void => {
    restartNodeByUser(store);
  };

  ipcMain.on("network:restartNode", restart);
  ipcMain.handle(NODE_CHANNELS.RETRY, restart);
  ipcMain.handle(
    NODE_CHANNELS.GET_RECOVERY_STATE,
    () => getNodeRecovery()?.getActiveEvent() ?? null,
  );
}
