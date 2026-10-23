// TODO(types): replace with the typed electron-store instance (Store<Schema>).
// Callers read and write dotted keys the typed API would reject today, so the
// store stays untyped at module boundaries until those call sites are typed.
export type AppStore = any;

/**
 * Creates the electron-store instance holding settings, wallet data and the
 * defaults for every persisted key.
 * @returns The store instance.
 */
export async function createAppStore() {
  const { default: Store } = await import("electron-store");

  return new Store({
    defaults: {
      mnemonic: null,
      activeWalletAddress: null,
      accounts: [],
      general: {
        launchAtLogin: true,
        openInBackground: false,
        pushNotifications: true,
        notificationSound: false,
        language: "English",
        currency: "CMU (native)",
      },
      appearance: {
        theme: "Light",
        accentColor: "#3b82f6", // blue-500
        density: "Comfortable",
        showSidebarColors: true,
        animatedTransitions: true,
      },
      network: {
        network: "CointMU Mainnet",
        rpcEndpoint: "https://rpc.cointmu.net",
        maxPeers: 14,
        discovery: true,
        listenPort: 30303,
        syncMode: "Snap (recommended)",
        pruneOldState: true,
        // Custom bootnode enodes; empty means the build or built-in default.
        bootnodes: [],
      },
      mining: {
        isMiningEnabled: false,
        startAtLaunch: false,
        cpuThreads: 4,
        intensity: "Balanced",
        pauseOnBattery: true,
        miningMode: "Solo",
        poolAddress: "",
      },
      security: {
        autoLock: true,
        requireBiometrics: false,
      },
      advanced: {
        httpRpc: true,
        wsRpc: false,
        corsOrigins: "https://*.cointmu.net",
        logLevel: "Info",
      },
      notifications: {
        global: true,
        transactions: true,
        mining: true,
        security: true,
        desktopOs: true,
        sound: false,
      },
      notificationHistory: [],
      telemetry: {
        enabled: true,
        noticeAcknowledged: false,
      },
    },
  });
}
