import { ipcMain } from "electron";
import { buildGenesis, setNetworkId } from "../geth/networkConfig";
import { NODE_RESTART_DELAY_MS, killGethProcess } from "../geth/gethProcess";
import { initAndSpawnGeth } from "../geth/gethStart";
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

      setTimeout(() => {
        void initAndSpawnGeth(store);
      }, NODE_RESTART_DELAY_MS);

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  });
}
