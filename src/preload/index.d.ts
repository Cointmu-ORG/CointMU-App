import { ElectronAPI } from "@electron-toolkit/preload";
import type { JsonRpcEnvelope, NodeRecoveryEvent } from "../bridge/types";

interface UpdaterProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

interface UpdaterEventInfo {
  version: string;
}

interface UpdaterEvent {
  status:
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  info?: UpdaterEventInfo;
  progress?: UpdaterProgress;
  error?: string;
}

interface DappRequest {
  id: number;
  method: string;
  params: unknown[];
  tabId: number;
  origin: string;
}

interface CointmuAPI {
  getRpcPort: () => Promise<number>;
  rpc: {
    call: (method: string, params?: unknown[]) => Promise<JsonRpcEnvelope>;
  };
  getCpuUsage: () => Promise<number>;
  getNodeStatus: () => Promise<{
    running: boolean;
    port: number;
    sessionValid: boolean;
    networkId: string;
  }>;
  network: {
    getInsights: () => Promise<{
      isOnline: boolean;
      height: number;
      blockTime: number;
      transactions: number;
      activeAddresses: number;
      difficulty: number;
      blocks: {
        number: number;
        hash: string;
        miner: string;
        timestamp: number;
        txCount: number;
      }[];
      coinbase: string;
    }>;
    getGenesisConfig: () => Promise<{
      config?: { chainId?: number };
      alloc?: Record<string, { balance: string }>;
    } | null>;
    setChainId: (chainId: number) => Promise<boolean>;
  };
  settings: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    getAll: () => Promise<any>;
  };
  saveKeystore: (
    keystoreJson: string,
    filename: string,
  ) => Promise<{
    success: boolean;
    path?: string;
    canceled?: boolean;
    error?: string;
  }>;
  clearAllData: () => Promise<{ success: boolean; error?: string }>;
  exportExtensionZip: () => Promise<boolean>;
  getDatadir: () => Promise<string>;
  getChainDbSize: () => Promise<number>;
  openDataFolder: () => Promise<string>;
  openKeystoreFile: () => Promise<{
    success: boolean;
    data?: string;
    canceled?: boolean;
    error?: string;
  }>;
  wallet: {
    encrypt: (secret: string, password: string) => Promise<string>;
    decrypt: (payload: string, password: string) => Promise<string>;
    verify: (payload: string, password: string) => Promise<boolean>;
    getActivity: (addresses: string[]) => Promise<
      {
        id: string;
        type: "mining" | "send" | "receive" | "contract";
        title: string;
        subtitle: string;
        amount: string;
        timestamp: number;
        timestampStr: string;
        blockNumber?: number;
        hash?: string;
        from?: string;
        to?: string;
      }[]
    >;
  };
  updater: {
    check: () => Promise<void>;
    download: () => Promise<void>;
    install: () => Promise<void>;
    onStateChange: (callback: (state: UpdaterEvent) => void) => () => void;
  };
  mining: {
    toggle: (enabled: boolean) => Promise<void>;
    setThreads: (cores: number) => Promise<void>;
    setPoolAddress: (address: string) => Promise<void>;
    getStats: () => Promise<{
      isMining: boolean;
      hashrate: number;
      difficulty: number;
      blockNumber: number;
    }>;
    onDagProgress: (callback: (progress: number) => void) => () => void;
    onMiningStatusChanged: (callback: (status: string) => void) => () => void;
    onMiningLog: (
      callback: (log: {
        id: string;
        timestamp: string;
        level: "INFO" | "OK" | "WARN" | "ERROR";
        message: string;
      }) => void,
    ) => () => void;
  };
  dapp: {
    onDappRequest: (callback: (payload: DappRequest) => void) => () => void;
    sendDappResponse: (payload: {
      id: number;
      tabId: number;
      approved: boolean;
      result?: unknown;
    }) => void;
    onSiteConnected: (callback: (origin: string) => void) => () => void;
    revokeSite: (origin: string) => void;
  };
  pairing: {
    onRequest: (callback: () => void) => () => void;
    respond: (approved: boolean) => void;
  };
  window: {
    minimize: () => void;
    close: () => void;
  };
  node: {
    onRecovery: (callback: (event: NodeRecoveryEvent) => void) => () => void;
    getRecoveryState: () => Promise<NodeRecoveryEvent | null>;
    retry: () => Promise<void>;
  };
  extension: {
    unlink: () => void;
    onLinked: (callback: () => void) => () => void;
    onStatusChange: (callback: (status: boolean) => void) => () => void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: CointmuAPI;
    systemInfo?: {
      version: string;
      codename?: string;
      build: string;
      platform: string;
      nodeVersion: string;
      getUptime: () => number;
    };
  }
}
