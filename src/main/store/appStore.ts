import {
  DisplayCurrency,
  LayoutDensity,
  LogLevel,
  MiningIntensity,
  SyncMode,
  ThemeMode,
} from "../../bridge/setting-values";
import {
  applySettingRules,
  migrateAutoLock,
  migrateSettingValues,
} from "./settingsMigration";

// TODO(types): replace with the typed electron-store instance (Store<Schema>).
// Callers read and write dotted keys the typed API would reject today, so the
// store stays untyped at module boundaries until those call sites are typed.
export type AppStore = any;

/**
 * Creates the electron-store instance holding settings, wallet data and the
 * defaults for every persisted key, and converts settings saved by 1.6.18 and
 * earlier (labels instead of codes) before anything reads them.
 * @returns The store instance.
 */
export async function createAppStore() {
  const { default: Store } = await import("electron-store");

  const store = new Store({
    defaults: {
      mnemonic: null,
      activeWalletAddress: null,
      accounts: [],
      general: {
        launchAtLogin: true,
        openInBackground: false,
        pushNotifications: true,
        notificationSound: false,
        currency: DisplayCurrency.CMU,
      },
      appearance: {
        theme: ThemeMode.LIGHT,
        accentColor: "#3b82f6", // blue-500
        density: LayoutDensity.COMFORTABLE,
        animatedTransitions: true,
      },
      network: {
        maxPeers: 14,
        discovery: true,
        listenPort: 30303,
        syncMode: SyncMode.SNAP,
        pruneOldState: true,
        // Nodes the user added and default nodes turned off (BootnodeSettings).
        bootnodes: { custom: [], disabled: [] },
      },
      mining: {
        isMiningEnabled: false,
        cpuThreads: 4,
        intensity: MiningIntensity.BALANCED,
        pauseOnBattery: true,
        miningMode: "Solo",
        poolAddress: "",
      },
      security: {
        requireBiometrics: false,
      },
      advanced: {
        httpRpc: true,
        wsRpc: false,
        corsOrigins: "https://*.cointmu.net",
        logLevel: LogLevel.INFO,
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

  const migrated = migrateSettingValues(store.store);
  if (migrated) {
    store.store = migrated;
  }
  const autoLock = migrateAutoLock(store.store);
  if (autoLock) {
    store.store = autoLock;
  }
  const filled = applySettingRules(store.store);
  if (filled) {
    store.store = filled;
  }
  return store;
}
