import "@sentry/electron/preload";
import "electron-log/preload";
import { contextBridge, ipcRenderer } from "electron";
import {
  BOOTNODE_CHANNELS,
  DIAGNOSTICS_CHANNELS,
  NODE_CHANNELS,
  RPC_CHANNELS,
  SYSTEM_CHANNELS,
} from "../bridge/ipc-channels";
import type {
  AppInfo,
  BootnodeSaveResult,
  BootnodeState,
  DialogText,
  JsonRpcEnvelope,
  NodePeerHint,
  NodeRecoveryEvent,
  QueuedReport,
  TelemetryState,
  WalletActivity,
} from "../bridge/types";

const appInfo: AppInfo = ipcRenderer.sendSync(SYSTEM_CHANNELS.GET_APP_INFO);
const MS_PER_SECOND = 1000;

let platformStr = "";
if (process.platform === "darwin") {
  platformStr = process.arch === "arm64" ? "Apple silicon" : "Intel Mac";
} else if (process.platform === "win32") {
  platformStr = `Windows ${process.arch}`;
} else {
  platformStr = `Linux ${process.arch}`;
}

const systemInfo = {
  version: appInfo.version,
  codename: appInfo.codename,
  build: appInfo.build,
  platform: platformStr,
  nodeVersion: process.versions.node,
  // App uptime from the main process start. process.uptime() has a bogus base
  // in a sandboxed preload.
  getUptime: () => (Date.now() - appInfo.startedAtMs) / MS_PER_SECOND,
};

/**
 * Per-file download progress forwarded from the main-process auto-updater.
 */
interface UpdaterProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

/**
 * Structured update lifecycle event emitted on the 'updater:state' channel.
 * Only the fields relevant to the current status are populated.
 */
interface UpdaterEvent {
  status:
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  info?: { version: string };
  progress?: UpdaterProgress;
  error?: string;
}

const api = {
  getRpcPort: (): Promise<number> => ipcRenderer.invoke("get-rpc-port"),
  rpc: {
    call: (method: string, params: unknown[] = []): Promise<JsonRpcEnvelope> =>
      ipcRenderer.invoke(RPC_CHANNELS.CALL, method, params),
  },
  getCpuUsage: (): Promise<number> => ipcRenderer.invoke("get-cpu-usage"),
  getNodeStatus: (): Promise<{
    running: boolean;
    port: number;
    sessionValid: boolean;
    networkId: string;
  }> => ipcRenderer.invoke("get-node-status"),
  network: {
    getInsights: () => ipcRenderer.invoke("network:getInsights"),
    getGenesisConfig: () => ipcRenderer.invoke("network:getGenesisConfig"),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke("settings:get", key),
    set: (key: string, value: any) =>
      ipcRenderer.invoke("settings:set", key, value),
    getAll: () => ipcRenderer.invoke("settings:getAll"),
  },
  saveKeystore: (
    keystoreJson: string,
    filename: string,
    dialogText: DialogText,
  ): Promise<{
    success: boolean;
    path?: string;
    canceled?: boolean;
    error?: string;
  }> =>
    ipcRenderer.invoke(
      "dialog:saveKeystore",
      keystoreJson,
      filename,
      dialogText,
    ),
  clearAllData: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("wallet:clearAllData"),
  exportExtensionZip: (dialogText: DialogText): Promise<boolean> =>
    ipcRenderer.invoke("export-extension-zip", dialogText),
  getDatadir: (): Promise<string> => ipcRenderer.invoke("app:getDatadir"),
  getChainDbSize: (): Promise<number> =>
    ipcRenderer.invoke("app:getChainDbSize"),
  openDataFolder: (): Promise<string> =>
    ipcRenderer.invoke("app:openDataFolder"),
  openKeystoreFile: (
    dialogText: DialogText,
  ): Promise<{
    success: boolean;
    data?: string;
    canceled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke("app:openKeystore", dialogText),
  wallet: {
    encrypt: (secret: string, password: string): Promise<string> =>
      ipcRenderer.invoke("wallet:encrypt", secret, password),
    decrypt: (payload: string, password: string): Promise<string> =>
      ipcRenderer.invoke("wallet:decrypt", payload, password),
    verify: (payload: string, password: string): Promise<boolean> =>
      ipcRenderer.invoke("wallet:verify", payload, password),
    getActivity: (addresses: string[]): Promise<WalletActivity[]> =>
      ipcRenderer.invoke("wallet:getActivity", addresses),
  },
  updater: {
    check: (): Promise<void> => ipcRenderer.invoke("updater:check"),
    download: (): Promise<void> => ipcRenderer.invoke("updater:download"),
    install: (): Promise<void> => ipcRenderer.invoke("updater:install"),
    onStateChange: (callback: (state: UpdaterEvent) => void) => {
      const handler = (_: any, state: UpdaterEvent): void => {
        callback(state);
      };
      ipcRenderer.on("updater:state", handler);
      return () => ipcRenderer.removeListener("updater:state", handler);
    },
  },
  mining: {
    toggle: (enabled: boolean) => ipcRenderer.invoke("mining:toggle", enabled),
    setThreads: (cores: number) =>
      ipcRenderer.invoke("mining:setThreads", cores),
    setPoolAddress: (address: string) =>
      ipcRenderer.invoke("mining:setPoolAddress", address),
    getStats: () => ipcRenderer.invoke("mining:getStats"),
    onDagProgress: (callback: (progress: number) => void) => {
      const handler = (_event: any, value: number): void => {
        callback(value);
      };
      ipcRenderer.on("mining:dagProgress", handler);
      return () => ipcRenderer.removeListener("mining:dagProgress", handler);
    },
    onMiningStatusChanged: (callback: (status: string) => void) => {
      const handler = (_: any, status: string): void => {
        callback(status);
      };
      ipcRenderer.on("mining:status-changed", handler);
      return () => ipcRenderer.removeListener("mining:status-changed", handler);
    },
    onMiningLog: (callback: (log: unknown) => void) => {
      const handler = (_event: any, log: unknown): void => {
        callback(log);
      };
      ipcRenderer.on("mining:log-event", handler);
      return () => ipcRenderer.removeListener("mining:log-event", handler);
    },
  },
  dapp: {
    onSiteConnected: (callback: (origin: string) => void) => {
      const handler = (_: any, origin: string): void => {
        callback(origin);
      };
      ipcRenderer.on("dapp:siteConnected", handler);
      return () => ipcRenderer.removeListener("dapp:siteConnected", handler);
    },
    revokeSite: (origin: string) => {
      ipcRenderer.send("dapp:revokeSite", origin);
    },
  },
  pairing: {
    onRequest: (callback: () => void) => {
      const handler = (): void => callback();
      ipcRenderer.on("pairing:request", handler);
      return () => ipcRenderer.removeListener("pairing:request", handler);
    },
    respond: (approved: boolean) =>
      ipcRenderer.send("pairing:respond", approved),
  },
  window: {
    minimize: (): void => ipcRenderer.send("window-minimize"),
    close: (): void => ipcRenderer.send("window-close"),
  },
  node: {
    onRecovery: (callback: (event: NodeRecoveryEvent) => void) => {
      const handler = (_: any, event: NodeRecoveryEvent): void =>
        callback(event);
      ipcRenderer.on(NODE_CHANNELS.RECOVERY, handler);
      return () => ipcRenderer.removeListener(NODE_CHANNELS.RECOVERY, handler);
    },
    getRecoveryState: (): Promise<NodeRecoveryEvent | null> =>
      ipcRenderer.invoke(NODE_CHANNELS.GET_RECOVERY_STATE),
    retry: (): Promise<void> => ipcRenderer.invoke(NODE_CHANNELS.RETRY),
    onPeerHint: (callback: (hint: NodePeerHint | null) => void) => {
      const handler = (_: unknown, hint: NodePeerHint | null): void =>
        callback(hint);
      ipcRenderer.on(NODE_CHANNELS.PEER_HINT, handler);
      return () => ipcRenderer.removeListener(NODE_CHANNELS.PEER_HINT, handler);
    },
    getPeerHint: (): Promise<NodePeerHint | null> =>
      ipcRenderer.invoke(NODE_CHANNELS.GET_PEER_HINT),
  },
  bootnode: {
    get: (): Promise<BootnodeState> =>
      ipcRenderer.invoke(BOOTNODE_CHANNELS.GET),
    set: (text: string): Promise<BootnodeSaveResult> =>
      ipcRenderer.invoke(BOOTNODE_CHANNELS.SET, text),
    reset: (): Promise<BootnodeState> =>
      ipcRenderer.invoke(BOOTNODE_CHANNELS.RESET),
  },
  diagnostics: {
    openLogsFolder: (): Promise<void> =>
      ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.OPEN_LOGS_FOLDER),
    copyRecentLogs: (): Promise<number> =>
      ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.COPY_RECENT_LOGS),
    getTelemetryState: (): Promise<TelemetryState> =>
      ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.GET_TELEMETRY_STATE),
    setTelemetryEnabled: (isEnabled: boolean): Promise<TelemetryState> =>
      ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.SET_TELEMETRY_ENABLED, isEnabled),
    acknowledgeNotice: (): Promise<TelemetryState> =>
      ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.ACKNOWLEDGE_NOTICE),
    listQueuedReports: (): Promise<QueuedReport[]> =>
      ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.LIST_QUEUED_REPORTS),
    clearQueuedReports: (): Promise<void> =>
      ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.CLEAR_QUEUED_REPORTS),
  },
  extension: {
    unlink: () => {
      ipcRenderer.send("extension:unlink");
    },
    onLinked: (callback: () => void) => {
      const handler = (): void => callback();
      ipcRenderer.on("extension:linked", handler);
      return () => ipcRenderer.removeListener("extension:linked", handler);
    },
    onStatusChange: (callback: (status: boolean) => void) => {
      const handler = (_: any, status: boolean): void => callback(status);
      ipcRenderer.on("dapp:extensionStatus", handler);
      return () => ipcRenderer.removeListener("dapp:extensionStatus", handler);
    },
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
    contextBridge.exposeInMainWorld("systemInfo", systemInfo);
  } catch {
    console.error("Failed to expose context bridge APIs");
  }
} else {
  // @ts-ignore
  window.api = api;
  // @ts-ignore
  window.systemInfo = systemInfo;
}
