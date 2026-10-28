import type {
  DisplayCurrency,
  LogLevel,
  MiningIntensity,
  SyncMode,
} from "@bridge/setting-values";

export interface CustomNetwork {
  name: string;
  rpcUrl: string;
  chainId: number;
  symbol: string;
}

export interface SettingsStore {
  mnemonic: string | null;
  activeWalletAddress: string | null;
  accounts: { address: string; label: string }[];
  general: {
    launchAtLogin: boolean;
    openInBackground: boolean;
    pushNotifications: boolean;
    notificationSound: boolean;
    currency: DisplayCurrency;
  };
  appearance: {
    theme: string;
    accentColor: string;
    density: string;
    showSidebarColors: boolean;
    animatedTransitions: boolean;
  };
  network: {
    network: string;
    rpcEndpoint: string;
    maxPeers: number;
    discovery: boolean;
    listenPort: number;
    syncMode: SyncMode;
    pruneOldState: boolean;
    customNetworks?: CustomNetwork[];
  };
  mining: {
    isMiningEnabled: boolean;
    startAtLaunch: boolean;
    cpuThreads: number;
    intensity: MiningIntensity;
    pauseOnBattery: boolean;
    miningMode: string;
    poolAddress: string;
  };
  security: {
    autoLock: boolean;
    requireBiometrics: boolean;
  };
  advanced: {
    httpRpc: boolean;
    wsRpc: boolean;
    corsOrigins: string;
    logLevel: LogLevel;
  };
  notifications: {
    transactionAlerts: boolean;
    miningAlerts: boolean;
    securityAlerts: boolean;
    appUpdates: boolean;
  };
}
