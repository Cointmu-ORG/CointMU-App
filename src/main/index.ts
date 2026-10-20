import { app, BrowserWindow, ipcMain } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { registerCryptoHandlers } from "./services/crypto";
import { registerSystemHandlers } from "./services/system";
import { initUpdater } from "./services/updater";
import ms from "ms";
import { registerRendererRpcHandler } from "./services/rendererRpc";
import { NODE_CHANNELS } from "../bridge/ipc-channels";
import { startExtensionSyncServer } from "./services/extensionSyncServer";
import { registerDiagnosticsHandlers } from "./diagnostics/diagnosticsIpc";
// Must stay below the imports above and above every local module below: see
// bootstrap.ts for why the evaluation order matters.
import "./bootstrap";
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
import { createAppStore } from "./services/appStore";
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
import { MiningController } from "./services/miningController";
import { registerWindowHandlers } from "./ipc/windowIpc";
import { registerSettingsHandlers } from "./ipc/settingsIpc";
import { registerWalletHandlers } from "./ipc/walletIpc";
import { registerAppHandlers } from "./ipc/appIpc";

const NODE_RESTART_DELAY_MS = ms("1s");

let isAppQuitting = false;

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

  registerSettingsHandlers(store);

  registerWalletHandlers(store);

  registerAppHandlers();

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

  registerWindowHandlers();

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
