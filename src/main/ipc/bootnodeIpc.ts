import { ipcMain } from "electron";
import { BOOTNODE_CHANNELS } from "../../bridge/ipc-channels";
import type {
  BootnodeSaveResult,
  BootnodeState,
  BootnodeStatus,
} from "../../bridge/types";
import {
  BOOTNODES_SETTING_KEY,
  EMPTY_BOOTNODE_SETTINGS,
  checkBootnodeSettings,
  migrateBootnodeSetting,
} from "../geth/bootnode/bootnodeSettings";
import {
  buildBootnodeState,
  hasRemovedEnodes,
} from "../geth/bootnode/bootnodeState";
import {
  DEFAULT_BOOTNODE_CONFIG,
  getActiveBootnodeConfig,
  getBootnodeConfig,
} from "../geth/bootnode/bootnodeWatcher";
import { syncStaticPeers } from "../geth/bootnode/staticPeers";
import {
  LIVE_PROBE_DEPS,
  probeBootnodes,
} from "../geth/bootnode/bootnodeStatus";
import { restartNodeByUser } from "../geth/process/nodeRestart";
import type { AppStore } from "../store/appStore";

function describe(store: AppStore): BootnodeState {
  return buildBootnodeState(
    store,
    DEFAULT_BOOTNODE_CONFIG,
    getActiveBootnodeConfig(),
  );
}

/**
 * Applies the saved list to the running node. Added nodes become static peers
 * at once; a removed or disabled node is still one of the running node's
 * --bootnodes, so only that case restarts it. When a recovery owns the node
 * the restart is skipped and the state reports it as pending.
 */
async function applyBootnodeChange(store: AppStore): Promise<BootnodeState> {
  const running = getActiveBootnodeConfig();
  const next = getBootnodeConfig(store);
  const needsRestart =
    running !== null && hasRemovedEnodes(running.enodes, next.enodes);
  if (needsRestart && restartNodeByUser(store)) {
    return buildBootnodeState(store, DEFAULT_BOOTNODE_CONFIG, null);
  }
  await syncStaticPeers(next.enodes);
  return describe(store);
}

/**
 * @param store - The settings store.
 * @returns Every listed node, disabled ones included.
 */
function listedEnodes(store: AppStore): string[] {
  return describe(store).nodes.map((node) => node.enode);
}

/**
 * Registers the node setting handlers and converts a setting saved in the #70
 * format. Every payload is validated here, in main; a rejected one leaves the
 * saved setting (and the running node) untouched.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {void}
 */
export function registerBootnodeHandlers(store: AppStore): void {
  migrateBootnodeSetting(store, DEFAULT_BOOTNODE_CONFIG.enodes);

  ipcMain.handle(BOOTNODE_CHANNELS.GET, () => describe(store));
  ipcMain.handle(
    BOOTNODE_CHANNELS.SET,
    async (_, input: unknown): Promise<BootnodeSaveResult> => {
      const check = checkBootnodeSettings(
        input,
        DEFAULT_BOOTNODE_CONFIG.enodes,
      );
      if (!check.isValid) {
        console.warn(`[bootnode] Rejected the node list (${check.error})`);
        return { isSaved: false, error: check.error };
      }
      store.set(BOOTNODES_SETTING_KEY, check.settings);
      console.log(
        `[bootnode] Saved ${check.settings.custom.length} custom node(s), ${check.settings.disabled.length} default(s) off`,
      );
      return { isSaved: true, state: await applyBootnodeChange(store) };
    },
  );
  ipcMain.handle(BOOTNODE_CHANNELS.RESET, async (): Promise<BootnodeState> => {
    store.set(BOOTNODES_SETTING_KEY, EMPTY_BOOTNODE_SETTINGS);
    console.log("[bootnode] Reset to the default nodes");
    // "Reset all settings" always calls this; with nothing removed from the
    // running node's list it only syncs the static peers.
    return applyBootnodeChange(store);
  });
  ipcMain.handle(
    BOOTNODE_CHANNELS.PROBE,
    (_, enode: unknown): Promise<BootnodeStatus[]> => {
      // Only listed nodes: the renderer must not turn this into a port scanner.
      const listed = listedEnodes(store);
      const targets =
        enode === undefined ? listed : listed.filter((item) => item === enode);
      return probeBootnodes(targets, LIVE_PROBE_DEPS);
    },
  );
}
