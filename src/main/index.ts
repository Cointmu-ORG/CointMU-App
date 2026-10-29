import { app, BrowserWindow } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { registerCryptoHandlers } from "./services/crypto";
import { registerSystemHandlers } from "./services/system";
import { initUpdater } from "./services/updater";
import { registerRendererRpcHandler } from "./services/rendererRpc";
import { startExtensionSyncServer } from "./services/extensionSyncServer";
import { registerDiagnosticsHandlers } from "./diagnostics/diagnosticsIpc";
// Must stay below the imports above and above every local module below: see
// bootstrap.ts for why the evaluation order matters.
import "./bootstrap";
import { getRpcPort, resolveGethPorts } from "./geth/ports";
import {
  loadNetworkId,
  resolveDataDir,
  resolveDataRoot,
} from "./geth/networkConfig";
import { startSession } from "./services/session";
import { createWindow } from "./window";
import { createAppStore } from "./services/appStore";
import {
  prepareGethIpcEndpoint,
  removeTemporaryIpcDir,
} from "./geth/ipcEndpointLifecycle";
import {
  attachNodeRecovery,
  killGethProcess,
  spawnGethProcess,
} from "./geth/gethProcess";
import { initGethIfNeeded } from "./geth/gethInit";
import { stopOrphanedGeth } from "./geth/orphanedGeth";
import { createNodeRecovery } from "./geth/nodeRecovery";
import { MiningController } from "./services/miningController";
import { registerWindowHandlers } from "./ipc/windowIpc";
import { registerSettingsHandlers } from "./ipc/settingsIpc";
import { registerBootnodeHandlers } from "./ipc/bootnodeIpc";
import { registerWalletHandlers } from "./ipc/walletIpc";
import { registerAppHandlers } from "./ipc/appIpc";
import { registerNetworkHandlers } from "./ipc/networkIpc";
import {
  registerNodeControlHandlers,
  registerNodeStatusHandlers,
} from "./ipc/nodeIpc";

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

  registerNodeStatusHandlers();

  const store = await createAppStore();

  registerDiagnosticsHandlers(store);
  registerSettingsHandlers(store);
  registerWalletHandlers(store);
  registerAppHandlers();
  registerCryptoHandlers();
  registerSystemHandlers();
  registerNetworkHandlers();
  registerNodeControlHandlers(store);
  registerBootnodeHandlers(store);
  registerWindowHandlers();

  await resolveGethPorts();

  loadNetworkId();

  attachNodeRecovery(createNodeRecovery(store));

  try {
    await stopOrphanedGeth(resolveDataRoot());
  } catch (err) {
    console.error("[geth:orphan] Could not stop a leftover geth:", err);
  }

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
