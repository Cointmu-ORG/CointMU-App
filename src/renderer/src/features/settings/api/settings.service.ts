/**
 * Typed wrapper around the electron-store settings IPC bridge. Centralizes all
 * persisted-configuration access so that view and hook layers never reference
 * the raw window.api surface directly.
 */

/**
 * Reads a single persisted setting by key.
 * @param key - The dot-delimited settings key.
 * @returns The stored value, or undefined when unset.
 */
async function getSetting<T = unknown>(key: string): Promise<T> {
  return window.api.settings.get(key) as Promise<T>;
}

/**
 * Persists a single setting value by key.
 * @param key - The dot-delimited settings key.
 * @param value - The value to persist.
 * @returns A promise resolving once the value is written.
 */
async function setSetting(key: string, value: unknown): Promise<void> {
  return window.api.settings.set(key, value);
}

/**
 * Reads the entire persisted settings tree.
 * @returns The full settings object.
 */
async function getAllSettings(): Promise<Record<string, any>> {
  return window.api.settings.getAll();
}

/**
 * Overwrites all mutable settings sections in electron-store with their
 * factory defaults. Wallet identity keys (mnemonic, accounts, activeWalletAddress)
 * are intentionally left untouched so the user does not lose access to funds.
 * @returns A promise that resolves once every section has been written.
 */
async function resetAllSettings(): Promise<void> {
  await Promise.all([
    setSetting("general", {
      launchAtLogin: true,
      openInBackground: false,
      pushNotifications: true,
      notificationSound: false,
      language: "English",
      currency: "CMU (native)",
    }),
    setSetting("appearance", {
      theme: "Light",
      accentColor: "#3b82f6",
      density: "Comfortable",
      showSidebarColors: true,
      animatedTransitions: true,
    }),
    setSetting("network", {
      network: "CointMU Mainnet",
      rpcEndpoint: "https://rpc.cointmu.net",
      maxPeers: 14,
      discovery: true,
      listenPort: 30303,
      syncMode: "Snap (recommended)",
      pruneOldState: true,
    }),
    setSetting("mining", {
      isMiningEnabled: false,
      startAtLaunch: false,
      cpuThreads: 4,
      intensity: "Balanced",
      pauseOnBattery: true,
      miningMode: "Solo",
      poolAddress: "",
    }),
    setSetting("security", {
      autoLock: true,
      requireBiometrics: false,
    }),
    setSetting("advanced", {
      httpRpc: true,
      wsRpc: false,
      corsOrigins: "https://*.cointmu.net",
      logLevel: "Info",
    }),
    setSetting("notifications", {
      global: true,
      transactions: true,
      mining: true,
      security: true,
      desktopOs: true,
      sound: false,
    }),
    setSetting("notificationHistory", []),
  ]);
}

export { getSetting, setSetting, getAllSettings, resetAllSettings };
