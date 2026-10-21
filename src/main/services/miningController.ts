import { BrowserWindow, ipcMain, powerMonitor } from "electron";
import { callGethRpc } from "../utils/rpcUtils";
import { scanWalletActivity, fetchNetworkInsights } from "./activityScanner";
import type { AppStore } from "./appStore";

/**
 * Central controller for managing the underlying Geth mining process.
 * Handles RPC dispatch, power state transitions via powerMonitor, and syncing
 * with the global electron-store configuration.
 */
export class MiningController {
  private rpcPort: number;
  private store: AppStore;
  private win: BrowserWindow | null;

  constructor(rpcPort: number, store: AppStore) {
    this.rpcPort = rpcPort;
    this.store = store;
    this.win = null;

    this.setupPowerMonitor();
    this.setupIpcHandlers();
  }

  public setWindow(win: BrowserWindow): void {
    this.win = win;
  }

  /**
   * Toggles the mining state on or off. Dispatches miner_start or miner_stop.
   * The etherbase is sourced exclusively from the persisted mining reward address
   * (mining.poolAddress) and never from the active wallet tab, so the address
   * that receives block rewards is owned solely by Mining Settings.
   * @param {boolean} enabled - Target mining state.
   * @returns {Promise<void>}
   */
  private async toggleMining(enabled: boolean): Promise<void> {
    this.store.set("mining.isMiningEnabled", enabled);
    if (enabled) {
      const rewardAddress = this.store.get("mining.poolAddress");
      if (!rewardAddress) {
        throw new Error(
          "No mining reward address configured. Set one in Mining Settings.",
        );
      }

      await callGethRpc(this.rpcPort, "miner_setEtherbase", [rewardAddress]);

      const threads = this.store.get("mining.cpuThreads") || 4;
      await callGethRpc(this.rpcPort, "miner_start", [Math.floor(threads)]);
    } else {
      await callGethRpc(this.rpcPort, "miner_stop");
    }
  }

  /**
   * Updates the allocated CPU threads. If mining is currently enabled, it gracefully
   * restarts the miner to apply the new thread count.
   * @param {number} cores - Number of CPU cores to allocate.
   * @returns {Promise<void>}
   */
  private async updateThreads(cores: number): Promise<void> {
    this.store.set("mining.cpuThreads", cores);
    const actuallyMining = await callGethRpc(this.rpcPort, "eth_mining");

    if (actuallyMining === true || actuallyMining === "true") {
      await callGethRpc(this.rpcPort, "miner_stop");
      await callGethRpc(this.rpcPort, "miner_start", [Math.floor(cores)]);
    }
  }

  /**
   * Sets the target pool address in the persistent store and dispatches
   * miner_setEtherbase to the running node.
   * @param {string} address - The 42-character hex wallet address.
   * @returns {Promise<void>}
   */
  private async setPoolAddress(address: string): Promise<void> {
    this.store.set("mining.poolAddress", address);
    await callGethRpc(this.rpcPort, "miner_setEtherbase", [address]);
  }

  private setupPowerMonitor(): void {
    powerMonitor.on("on-battery", async () => {
      const pauseOnBattery = this.store.get("mining.pauseOnBattery");
      if (pauseOnBattery) {
        console.log("[power] On battery - pausing miner");
        await callGethRpc(this.rpcPort, "miner_stop");
        if (this.win) {
          this.win.webContents.send(
            "mining:status-changed",
            "Paused (Battery)",
          );
        }
      }
    });

    powerMonitor.on("on-ac", async () => {
      const isMiningEnabled = this.store.get("mining.isMiningEnabled");
      const pauseOnBattery = this.store.get("mining.pauseOnBattery");
      if (isMiningEnabled && pauseOnBattery) {
        const threads = this.store.get("mining.cpuThreads") || 4;
        console.log("[power] On AC - resuming miner with", threads, "threads");
        await callGethRpc(this.rpcPort, "miner_start", [threads]);
        if (this.win) {
          this.win.webContents.send("mining:status-changed", "Mining");
        }
      }
    });
  }

  private setupIpcHandlers(): void {
    ipcMain.handle("mining:toggle", async (_, enabled: boolean) => {
      await this.toggleMining(enabled);
    });

    ipcMain.handle("mining:setThreads", async (_, cores: number) => {
      await this.updateThreads(cores);
    });

    ipcMain.handle("mining:setPoolAddress", async (_, address: string) => {
      await this.setPoolAddress(address);
    });

    /**
     * Retrieves the current mining status, hashrate, block difficulty, and latest block height directly from the Geth node.
     * @returns {Promise<{isMining: boolean, hashrate: number, difficulty: number, blockNumber: number}>} The current stats.
     */
    ipcMain.handle(
      "mining:getStats",
      async (): Promise<{
        isMining: boolean;
        hashrate: number;
        difficulty: number;
        blockNumber: number;
      }> => {
        try {
          const isMiningHex = await callGethRpc(this.rpcPort, "eth_mining");
          const hashrateHex = await callGethRpc(this.rpcPort, "eth_hashrate");
          const latestBlock = await callGethRpc(
            this.rpcPort,
            "eth_getBlockByNumber",
            ["latest", false],
          );
          const difficulty =
            latestBlock && latestBlock.difficulty
              ? parseInt(latestBlock.difficulty, 16)
              : 0;
          const blockNumber =
            latestBlock && latestBlock.number
              ? parseInt(latestBlock.number, 16)
              : 0;
          const hashrate =
            typeof hashrateHex === "string"
              ? parseInt(hashrateHex, 16) || 0
              : Number(hashrateHex) || 0;
          const isMining = isMiningHex === true || isMiningHex === "true";

          console.debug(
            `[mining:getStats] eth_mining=${isMiningHex} eth_hashrate raw=${hashrateHex} parsed=${hashrate} H/s`,
          );

          return { isMining, hashrate, difficulty, blockNumber };
        } catch (error) {
          return {
            isMining: false,
            hashrate: 0,
            difficulty: 0,
            blockNumber: 0,
          };
        }
      },
    );

    ipcMain.handle("wallet:getActivity", async (_, addresses: string[]) => {
      return scanWalletActivity(this.rpcPort, addresses);
    });

    /**
     * Fetches aggregated network statistics from the local Geth node.
     * @param {Electron.IpcMainInvokeEvent} _event - The IPC event object.
     * @returns {Promise<object>} The aggregated network statistics payload.
     */
    ipcMain.handle("network:getInsights", async (_event) => {
      return fetchNetworkInsights(this.rpcPort);
    });
  }
}
