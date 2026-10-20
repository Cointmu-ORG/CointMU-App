import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  powerMonitor,
  dialog,
} from "electron";
import { join } from "path";
import { existsSync, writeFileSync } from "fs";
import { readFile, copyFile } from "fs/promises";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { registerCryptoHandlers } from "./services/crypto";
import { registerSystemHandlers } from "./services/system";
import { initUpdater } from "./services/updater";
import ms from "ms";
import { callGethRpc } from "./utils/rpcUtils";
import { registerRendererRpcHandler } from "./services/rendererRpc";
import { NODE_CHANNELS } from "../bridge/ipc-channels";
import {
  scanWalletActivity,
  fetchNetworkInsights,
} from "./services/activityScanner";
import {
  startExtensionSyncServer,
  broadcastWalletState,
} from "./services/extensionSyncServer";
import { registerDiagnosticsHandlers } from "./diagnostics/diagnosticsIpc";
// Must stay below the imports above and above every local module below: see
// bootstrap.ts for why the evaluation order matters.
import "./bootstrap";
import { getDirectorySize } from "./services/directorySize";
import { getRpcPort, resolveGethPorts } from "./geth/ports";
import {
  buildGenesis,
  getNetworkId,
  loadNetworkId,
  resolveDataDir,
  setNetworkId,
} from "./geth/networkConfig";
import { isSessionValid, startSession } from "./services/session";
import { createWindow } from "./window";
import { createAppStore, type AppStore } from "./services/appStore";
import {
  prepareGethIpcEndpoint,
  removeTemporaryIpcDir,
} from "./geth/ipcEndpointLifecycle";
import {
  attachNodeRecovery,
  getNodeRecovery,
  isGethRunning,
  killGethProcess,
  spawnGethProcess,
} from "./geth/gethProcess";
import { initGethIfNeeded } from "./geth/gethInit";
import { createNodeRecovery } from "./geth/nodeRecovery";

const NODE_RESTART_DELAY_MS = ms("1s");

let isAppQuitting = false;

/**
 * Central controller for managing the underlying Geth mining process.
 * Handles RPC dispatch, power state transitions via powerMonitor, and syncing
 * with the global electron-store configuration.
 */
class MiningController {
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

// A second instance would spawn a second geth on the same datadir and fail on
// the database lock, so it quits and hands focus to the running instance.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  const [win] = BrowserWindow.getAllWindows();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  electronApp.setAppUserModelId("com.cointmu.desktop");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  startSession();

  ipcMain.handle("get-rpc-port", () => getRpcPort());
  ipcMain.handle("get-node-status", () => ({
    running: isGethRunning(),
    port: getRpcPort(),
    sessionValid: isSessionValid(),
    networkId: getNetworkId(),
  }));

  const store = await createAppStore();

  registerDiagnosticsHandlers(store);

  ipcMain.handle("settings:get", (_, key) => store.get(key));
  ipcMain.handle("settings:set", (_, key, value) => {
    store.set(key, value);
    if (key === "activeWalletAddress" || key === "network.network") {
      void broadcastWalletState(store, getRpcPort());
    }
  });
  ipcMain.handle("settings:getAll", () => store.store);

  ipcMain.handle(
    "dialog:saveKeystore",
    async (_, keystoreJson: string, filename: string) => {
      const result = await dialog.showSaveDialog({
        title: "Export Keystore",
        defaultPath: filename,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      try {
        writeFileSync(result.filePath, keystoreJson, "utf8");
        return { success: true, path: result.filePath };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle("export-extension-zip", async () => {
    const sourcePath = app.isPackaged
      ? join(process.resourcesPath, "extension.zip")
      : join(app.getAppPath(), "resources", "extension.zip");

    if (!existsSync(sourcePath)) {
      console.error("[export] Extension ZIP not found at:", sourcePath);
      return false;
    }

    const result = await dialog.showSaveDialog({
      title: "Export Companion Browser Extension",
      defaultPath: "CointMU-Extension.zip",
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    });

    if (result.canceled || !result.filePath) {
      return false;
    }

    try {
      await copyFile(sourcePath, result.filePath);
      return true;
    } catch (err) {
      console.error("[export] Failed to copy extension ZIP:", err);
      return false;
    }
  });

  ipcMain.handle("wallet:clearAllData", () => {
    try {
      store.set("encryptedPayload", null);
      store.set("mnemonic", null);
      store.set("activeWalletAddress", null);
      store.set("accounts", []);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle("app:getDatadir", () => resolveDataDir());

  ipcMain.handle("app:getChainDbSize", async () => {
    try {
      return await getDirectorySize(
        join(resolveDataDir(), "geth", "chaindata"),
      );
    } catch {
      return 0;
    }
  });

  ipcMain.handle("app:openDataFolder", () => shell.openPath(resolveDataDir()));

  ipcMain.handle("app:openKeystore", async () => {
    const result = await dialog.showOpenDialog({
      title: "Import Keystore",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    try {
      const data = await readFile(result.filePaths[0], "utf8");
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  registerCryptoHandlers();
  registerSystemHandlers();

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

  ipcMain.on("window-minimize", (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    if (win) {
      win.minimize();
    }
  });

  ipcMain.on("window-close", (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    if (win) {
      win.close();
    }
  });

  await resolveGethPorts();

  loadNetworkId(store);

  attachNodeRecovery(createNodeRecovery(store));

  try {
    await initGethIfNeeded(resolveDataDir());
  } catch (err) {
    console.error("[geth:init] Fatal error during genesis init:", err);
  }

  await prepareGethIpcEndpoint(store);
  await spawnGethProcess(store);

  const miningController = new MiningController(getRpcPort(), store);
  const removeRendererRpcHandler = registerRendererRpcHandler(getRpcPort);

  const win = createWindow();
  initUpdater(win);
  miningController.setWindow(win);

  const extSyncServer = startExtensionSyncServer(store, getRpcPort(), win);

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on("before-quit", () => {
    extSyncServer.close();
    removeRendererRpcHandler();
  });
});

/**
 * Intercepts the quit sequence so the app does not terminate until the geth
 * child process has been given a chance to persist its chain state to disk.
 */
app.on("before-quit", (e) => {
  if (isAppQuitting) {
    return;
  }
  e.preventDefault();
  isAppQuitting = true;
  killGethProcess()
    .then(removeTemporaryIpcDir)
    .then(() => {
      app.exit();
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("SIGINT", () => {
  if (isAppQuitting) return;
  isAppQuitting = true;
  killGethProcess()
    .then(removeTemporaryIpcDir)
    .then(() => {
      app.exit();
    });
});

process.on("SIGTERM", () => {
  if (isAppQuitting) return;
  isAppQuitting = true;
  killGethProcess()
    .then(removeTemporaryIpcDir)
    .then(() => {
      app.exit();
    });
});
