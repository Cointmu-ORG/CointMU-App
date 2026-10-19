import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import { readFileSync } from "fs";
import { join } from "path";
import { NODE_CHANNELS, RPC_CHANNELS } from "../bridge/ipc-channels";
import type { JsonRpcEnvelope, NodeRecoveryEvent } from "../bridge/types";

const pkg = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
);

let platformStr = "";
if (process.platform === "darwin") {
  platformStr = process.arch === "arm64" ? "Apple silicon" : "Intel Mac";
} else if (process.platform === "win32") {
  platformStr = `Windows ${process.arch}`;
} else {
  platformStr = `Linux ${process.arch}`;
}

let buildId = "00000000";
try {
  const buildData = JSON.parse(
    readFileSync(join(__dirname, "../../build-info.json"), "utf-8"),
  );
  if (typeof buildData.build === "string") {
    buildId = buildData.build;
  }
} catch (e) {
  buildId = "00000000";
}

const systemInfo = {
  version: pkg.version,
  codename: pkg.codename,
  build: buildId,
  platform: platformStr,
  nodeVersion: process.versions.node,
  getUptime: () => process.uptime(),
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
    setChainId: (chainId: number) =>
      ipcRenderer.invoke("network:setChainId", chainId),
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
  ): Promise<{
    success: boolean;
    path?: string;
    canceled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke("dialog:saveKeystore", keystoreJson, filename),
  clearAllData: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("wallet:clearAllData"),
  exportExtensionZip: (): Promise<boolean> =>
    ipcRenderer.invoke("export-extension-zip"),
  getDatadir: (): Promise<string> => ipcRenderer.invoke("app:getDatadir"),
  getChainDbSize: (): Promise<number> =>
    ipcRenderer.invoke("app:getChainDbSize"),
  openDataFolder: (): Promise<string> =>
    ipcRenderer.invoke("app:openDataFolder"),
  openKeystoreFile: (): Promise<{
    success: boolean;
    data?: string;
    canceled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke("app:openKeystore"),
  wallet: {
    encrypt: (secret: string, password: string): Promise<string> =>
      ipcRenderer.invoke("wallet:encrypt", secret, password),
    decrypt: (payload: string, password: string): Promise<string> =>
      ipcRenderer.invoke("wallet:decrypt", payload, password),
    verify: (payload: string, password: string): Promise<boolean> =>
      ipcRenderer.invoke("wallet:verify", payload, password),
    getActivity: (addresses: string[]): Promise<any[]> =>
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
    onDappRequest: (
      callback: (payload: {
        id: number;
        method: string;
        params: unknown[];
        tabId: number;
        origin: string;
      }) => void,
    ) => {
      const handler = (
        _: any,
        payload: {
          id: number;
          method: string;
          params: unknown[];
          tabId: number;
          origin: string;
        },
      ): void => {
        callback(payload);
      };
      ipcRenderer.on("dapp:request", handler);
      return () => ipcRenderer.removeListener("dapp:request", handler);
    },
    sendDappResponse: (payload: {
      id: number;
      tabId: number;
      approved: boolean;
      result?: unknown;
    }) => {
      ipcRenderer.send("dapp:response", payload);
    },
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
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
    contextBridge.exposeInMainWorld("systemInfo", systemInfo);
  } catch {
    console.error("Failed to expose context bridge APIs");
  }
} else {
  // @ts-ignore
  window.electron = electronAPI;
  // @ts-ignore
  window.api = api;
  // @ts-ignore
  window.systemInfo = systemInfo;
}
