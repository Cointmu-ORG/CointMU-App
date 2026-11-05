// Must stay the first import: see bootstrap.ts for why the evaluation order matters.
import "./bootstrap";
import { app, BrowserWindow } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { registerCryptoHandlers } from "../wallet/crypto";
import { registerSystemHandlers } from "./system";
import { initUpdater } from "./updater";
import { registerRendererRpcHandler } from "../ipc/rendererRpc";
import { startExtensionSyncServer } from "../extension/extensionSyncServer";
import { registerDiagnosticsHandlers } from "../diagnostics/diagnosticsIpc";
import { getRpcPort, resolveGethPorts } from "../geth/process/ports";
import {
  loadNetworkId,
  resolveDataDir,
  resolveDataRoot,
  setDataRoot,
} from "../geth/process/networkConfig";
import { storedDataRoot } from "../geth/process/chainDataMove";
import { registerChainDataHandlers } from "../ipc/chainDataIpc";
import { CHAIN_DATA_ROOT_KEY } from "../store/settingRules";
import { startSession } from "./session";
import { createWindow } from "./window";
import { syncLoginItemFromOs } from "./loginItem";
import { createAppStore } from "../store/appStore";
import { prepareGethIpcEndpoint } from "../geth/process/ipcEndpointLifecycle";
import {
  attachNodeRecovery,
  spawnGethProcess,
} from "../geth/process/gethProcess";
import {
  initGethIfNeeded,
  resolveGethBinaryPath,
} from "../geth/process/gethInit";
import { supervisorFor } from "../geth/process/gethSupervisor";
import {
  GETH_GRACEFUL_TIMEOUT_MS,
  stopOrphanedGeth,
} from "../geth/process/orphanedGeth";
import { createNodeRecovery } from "../geth/recovery/nodeRecovery";
import { MiningController } from "../mining/miningController";
import { registerWindowHandlers } from "../ipc/windowIpc";
import { registerSettingsHandlers } from "../ipc/settingsIpc";
import { registerBootnodeHandlers } from "../ipc/bootnodeIpc";
import { registerWalletHandlers } from "../ipc/walletIpc";
import { registerAppHandlers } from "../ipc/appIpc";
import { registerNetworkHandlers } from "../ipc/networkIpc";
import {
  registerNodeControlHandlers,
  registerNodeStatusHandlers,
} from "../ipc/nodeIpc";
import { registerExplorerHandlers } from "../ipc/explorerIpc";
import { registerShellHandlers } from "../ipc/shellIpc";
import { registerQuitHandler, setQuitConfirmation } from "./appQuit";
import { createQuitConfirmation } from "./quitConfirmation";
import { setupTray } from "./traySetup";
import { applyStoredZoom } from "./windowZoom";
import {
  queryIndexStatus,
  queryMinerDistribution,
  requestIndexRebuild,
} from "../explorerIndex/explorerIndexService";

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
  syncLoginItemFromOs(store);
  // Before anything resolves the datadir: orphan check, init, spawn.
  setDataRoot(storedDataRoot(store.get(CHAIN_DATA_ROOT_KEY)));

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
  registerChainDataHandlers(store);
  registerExplorerHandlers({
    minerDistribution: queryMinerDistribution,
    status: queryIndexStatus,
    rebuild: requestIndexRebuild,
  });

  await resolveGethPorts();

  loadNetworkId();

  attachNodeRecovery(createNodeRecovery(store));

  try {
    await stopOrphanedGeth(
      resolveDataRoot(),
      GETH_GRACEFUL_TIMEOUT_MS,
      supervisorFor(resolveGethBinaryPath()),
    );
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
  registerRendererRpcHandler(getRpcPort);

  const win = createWindow();
  applyStoredZoom(store, win);
  initUpdater(win, store);
  miningController.setWindow(win);
  registerShellHandlers(setupTray(store, win, miningController));
  setQuitConfirmation(createQuitConfirmation(store, win, getRpcPort));

  const extSyncServer = startExtensionSyncServer(store, getRpcPort(), win);

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on("before-quit", () => {
    extSyncServer.close();
  });
});

registerQuitHandler();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
