import { BrowserWindow, ipcMain } from "electron";
import { callGethRpc } from "../geth/rpc/rpcUtils";
import {
  scanWalletActivity,
  fetchNetworkInsights,
} from "../wallet/activityScanner";
import type { AppStore } from "../store/appStore";
import {
  IpcErrorCode,
  MiningAutoStartPhase,
  type MiningAutoStartState,
  type MiningPowerStatus,
} from "../../bridge/types";
import type { MiningPolicy } from "./miningPolicyRunner";
import { createMiningPolicy } from "./miningPolicySetup";
import type { MiningAutoStart } from "./miningAutoStart";
import { createMiningAutoStart } from "./miningAutoStartSetup";
import { showAutoStartNotice } from "./miningAutoStartNotice";

/**
 * Central controller for managing the underlying Geth mining process.
 * Handles RPC dispatch and the user's mining switch; whether switched-on
 * mining runs right now (battery, idle, schedule) is the mining policy's call.
 */
export class MiningController {
  private rpcPort: number;
  private store: AppStore;
  private win: BrowserWindow | null;
  private policy: MiningPolicy;
  private autoStart: MiningAutoStart;
  private closeAutoStartNotice: (() => void) | null = null;
  // Started this session from the Mining page, the tray, or "Start mining
  // at launch" (the stored mining.isMiningEnabled is only the permission).
  private isStarted = false;

  constructor(rpcPort: number, store: AppStore) {
    this.rpcPort = rpcPort;
    this.store = store;
    this.win = null;

    this.policy = createMiningPolicy(
      rpcPort,
      store,
      () => this.isStarted,
      (status) => this.publishStatus(status),
    );
    this.autoStart = createMiningAutoStart(rpcPort, store, {
      isStarted: () => this.isStarted,
      start: () => this.applyMining(true),
      publish: (state) => this.publishAutoStart(state),
    });
    this.setupIpcHandlers();
  }

  private publishStatus(status: MiningPowerStatus): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send("mining:status-changed", status);
    }
  }

  private publishAutoStart(state: MiningAutoStartState): void {
    this.closeAutoStartNotice?.();
    this.closeAutoStartNotice = null;
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send("mining:auto-start", state);
    if (state.phase === MiningAutoStartPhase.COUNTDOWN) {
      this.closeAutoStartNotice = showAutoStartNotice(this.win, () =>
        this.autoStart.cancel(),
      );
    }
  }

  public setWindow(win: BrowserWindow): void {
    this.win = win;
  }

  /** Starts "Start mining at launch" for this session; call once the window exists. */
  public beginAutoStart(): void {
    this.autoStart.begin();
  }

  /** @returns Whether the user has mining started (it may be paused). */
  public isEnabled(): boolean {
    return this.isStarted;
  }

  /**
   * Switches mining on or off, as the Mining page's toggle does.
   * @param enabled - The new state.
   * @throws MINING_NO_REWARD_ADDRESS when no reward address is set.
   */
  public async setEnabled(enabled: boolean): Promise<void> {
    await this.toggleMining(enabled);
  }

  /**
   * The user switched mining on or off (Mining page, tray, Settings). Either
   * way, mining is no longer started automatically this session.
   * @param enabled - Target mining state.
   * @throws MINING_NO_REWARD_ADDRESS, see applyMining.
   */
  private async toggleMining(enabled: boolean): Promise<void> {
    this.autoStart.endForSession();
    await this.applyMining(enabled);
  }

  /**
   * Switches mining on or off. On: the policy starts the miner (etherbase =
   * the persisted reward address, mining.poolAddress, never the active
   * wallet) unless a condition pauses it. Off: the miner stops at once.
   * @param {boolean} enabled - Target mining state.
   * @returns {Promise<void>}
   * @throws MINING_NO_REWARD_ADDRESS when switching on without a reward
   *   address; mining then stays off.
   */
  private async applyMining(enabled: boolean): Promise<void> {
    if (enabled && !this.store.get("mining.poolAddress")) {
      throw new Error(IpcErrorCode.MINING_NO_REWARD_ADDRESS);
    }
    this.isStarted = enabled;
    this.store.set("mining.isMiningEnabled", enabled);
    if (!enabled) await callGethRpc(this.rpcPort, "miner_stop");
    await this.policy.evaluate();
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

    ipcMain.handle("mining:getPowerStatus", () => this.policy.getStatus());

    ipcMain.handle("mining:getAutoStart", () => this.autoStart.getState());

    ipcMain.handle("mining:cancelAutoStart", () => this.autoStart.cancel());

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
