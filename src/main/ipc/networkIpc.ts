import { ipcMain } from "electron";
import { buildGenesis } from "../geth/process/networkConfig";

/**
 * Registers the genesis read. The desktop app runs one network, so there is
 * no channel to switch chain ids.
 * @returns {void}
 */
export function registerNetworkHandlers(): void {
  ipcMain.handle("network:getGenesisConfig", () => {
    return buildGenesis();
  });
}
