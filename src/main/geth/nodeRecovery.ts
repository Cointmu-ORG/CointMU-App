import { BrowserWindow } from "electron";
import ms from "ms";
import { GethRecovery } from "../services/gethRecovery";
import {
  PeerWatchdog,
  isAnyBootnodeReachable,
  isTcpReachable,
} from "../services/peerWatchdog";
import { NODE_CHANNELS } from "../../bridge/ipc-channels";
import { NodeRecoveryStage } from "../../bridge/types";
import { requestIndexRebuild } from "../explorerIndex/explorerIndexService";
import {
  reportPeerHint,
  reportRecoveryEvent,
} from "../diagnostics/gethReporting";
import { callGethRpc } from "../utils/rpcUtils";
import { getActiveBootnodeConfig } from "./bootnodeWatcher";
import {
  hasGethExited,
  isGethRunning,
  killGethProcess,
  spawnGethProcess,
} from "./process/gethProcess";
import { initGethIfNeeded } from "./process/gethInit";
import { resolveDataDir } from "./process/networkConfig";
import { getRpcPort } from "./process/ports";
import type { AppStore } from "../services/appStore";

const PEER_COUNT_TIMEOUT_MS = ms("5s");
const BOOTNODE_PROBE_TIMEOUT_MS = ms("3s");

/**
 * Builds the recovery controller that owns geth restarts after a classified
 * failure, wired to the node lifecycle and the renderer recovery channel, and
 * starts the peer watchdog alongside it.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {GethRecovery} The recovery controller.
 */
export function createNodeRecovery(store: AppStore): GethRecovery {
  peerWatchdog.start();
  return new GethRecovery({
    spawnGeth: () => spawnGethProcess(store),
    stopGeth: killGethProcess,
    hasGethExited,
    initGenesis: initGethIfNeeded,
    resolveDataDir,
    resolveRpcPort: () =>
      (store.get("advanced.httpRpc") ?? true) ? getRpcPort() : null,
    broadcast: (event) => {
      reportRecoveryEvent(event);
      if (event.stage === NodeRecoveryStage.QUARANTINED) {
        requestIndexRebuild("chaindata quarantined");
      }
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(NODE_CHANNELS.RECOVERY, event);
      });
    },
  });
}

/**
 * Reads the peer count over the IPC endpoint (admin_peers), which works even
 * when the HTTP-RPC endpoint is disabled.
 * @returns {Promise<number | null>} The peer count, or null when geth did not answer.
 */
async function getPeerCount(): Promise<number | null> {
  const peers: unknown = await callGethRpc(
    getRpcPort(),
    "admin_peers",
    [],
    PEER_COUNT_TIMEOUT_MS,
  );
  return Array.isArray(peers) ? peers.length : null;
}

/**
 * Probes the TCP port of each bootnode the running node was started with,
 * custom ones included.
 * @returns {Promise<boolean>} True when any bootnode accepted a connection.
 */
async function isBootnodeReachable(): Promise<boolean> {
  const enodes = getActiveBootnodeConfig()?.enodes ?? [];
  return isAnyBootnodeReachable(enodes, (host, port) =>
    isTcpReachable(host, port, BOOTNODE_PROBE_TIMEOUT_MS),
  );
}

/** Explains a peerless node to the renderer; started once geth is spawned. */
export const peerWatchdog = new PeerWatchdog({
  isGethRunning,
  getPeerCount,
  isBootnodeReachable,
  broadcast: (hint) => {
    reportPeerHint(hint);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(NODE_CHANNELS.PEER_HINT, hint);
    });
  },
});
