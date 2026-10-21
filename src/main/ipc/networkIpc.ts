import { ipcMain } from "electron";
import {
  buildGenesis,
  resolveDataDir,
  setNetworkId,
} from "../geth/networkConfig";
import {
  NODE_RESTART_DELAY_MS,
  killGethProcess,
  spawnGethProcess,
} from "../geth/gethProcess";
import { initGethIfNeeded } from "../geth/gethInit";
import type { AppStore } from "../services/appStore";

/**
 * Registers the genesis read and the chain-id switch, which stops geth and
 * respawns it on the new network's datadir.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {void}
 */
export function registerNetworkHandlers(store: AppStore): void {
  ipcMain.handle("network:getGenesisConfig", () => {
    return buildGenesis();
  });

  ipcMain.handle("network:setChainId", async (_, newId: number) => {
    try {
      setNetworkId(String(newId));
      store.set("network.chainId", newId);

      await killGethProcess();

      const dataDir = resolveDataDir();

      setTimeout(async () => {
        try {
          await initGethIfNeeded(dataDir);
        } catch (err) {
          console.error(
            "[network:setChainId] Genesis re-initialization failed",
            err,
          );
        }
        void spawnGethProcess(store);
      }, NODE_RESTART_DELAY_MS);

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  });
}
