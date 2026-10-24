import { setSetting } from "@/shared/api";
import { resetBootnodes } from "./bootnode.service";

/**
 * Network defaults, written key by key: the generic setter refuses the
 * "network" object because it would also overwrite network.bootnodes, which
 * only the validated bootnode channel may change.
 */
const NETWORK_DEFAULTS: Readonly<Record<string, unknown>> = {
  network: "CointMU Mainnet",
  rpcEndpoint: "https://rpc.cointmu.net",
  maxPeers: 14,
  discovery: true,
  listenPort: 30303,
  syncMode: "Snap (recommended)",
  pruneOldState: true,
  customNetworks: [],
  // Unset: the next launch falls back to the genesis chain id.
  chainId: null,
};

/**
 * Overwrites all mutable settings sections in electron-store with their
 * factory defaults. Wallet identity keys (mnemonic, accounts, activeWalletAddress)
 * are intentionally left untouched so the user does not lose access to funds.
 * Custom bootnodes are cleared last, through the bootnode channel, so a node
 * restart it triggers starts with the other defaults already written.
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
    ...Object.entries(NETWORK_DEFAULTS).map(([key, value]) =>
      setSetting(`network.${key}`, value),
    ),
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
  await resetBootnodes();
}

export { resetAllSettings };
