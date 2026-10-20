import { app, shell, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "path";
import { existsSync, writeFileSync } from "fs";
import { readFile, copyFile } from "fs/promises";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { registerCryptoHandlers } from "./services/crypto";
import { registerSystemHandlers } from "./services/system";
import { initUpdater } from "./services/updater";
import ms from "ms";
import { registerRendererRpcHandler } from "./services/rendererRpc";
import { NODE_CHANNELS } from "../bridge/ipc-channels";
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
