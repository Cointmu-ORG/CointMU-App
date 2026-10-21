import { BrowserWindow } from "electron";
import { GethRecovery } from "../services/gethRecovery";
import { NODE_CHANNELS } from "../../bridge/ipc-channels";
import { reportRecoveryEvent } from "../diagnostics/gethReporting";
import {
  hasGethExited,
  killGethProcess,
  spawnGethProcess,
} from "./gethProcess";
import { initGethIfNeeded } from "./gethInit";
import { resolveDataDir } from "./networkConfig";
import { getRpcPort } from "./ports";
import type { AppStore } from "../services/appStore";

/**
 * Builds the recovery controller that owns geth restarts after a classified
 * failure, wired to the node lifecycle and the renderer recovery channel.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {GethRecovery} The recovery controller.
 */
export function createNodeRecovery(store: AppStore): GethRecovery {
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
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(NODE_CHANNELS.RECOVERY, event);
      });
    },
  });
}
