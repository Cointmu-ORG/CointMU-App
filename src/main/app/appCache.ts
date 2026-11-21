import type { Session } from "electron";
import { assertNodeStarted } from "../geth/process/nodeStartup";

/**
 * The Electron storages "Clear cache" wipes. localStorage, IndexedDB and
 * cookies are left alone: they hold the token list, hidden tokens and the
 * language.
 */
export const CLEARED_ELECTRON_STORAGES = [
  "cachestorage",
  "shadercache",
] as const;

/** What clearing needs; tests pass fakes. */
export interface AppCacheDeps {
  readonly session: Pick<
    Session,
    "clearCache" | "clearStorageData" | "clearCodeCaches"
  >;
  readonly rebuildExplorerIndex: (reason: string) => void;
  readonly resetTokenScan: () => void;
  readonly clearNftMedia: () => void;
}

/**
 * Settings → Clear cache, main side: the explorer index and the token/NFT
 * scan state rebuild from the node, the NFT media cache empties, and
 * Electron drops its HTTP, Cache Storage, shader and code caches. Wallets,
 * settings, custom logos, hidden tokens and the chain data are not touched.
 * @param deps - The session and the services to reset.
 * @throws NODE_STARTING while the launch-time node startup runs: the index
 *   rebuild would race the startup spawn.
 */
export async function clearAppCache(deps: AppCacheDeps): Promise<void> {
  assertNodeStarted();
  deps.rebuildExplorerIndex("cache cleared by the user");
  deps.resetTokenScan();
  deps.clearNftMedia();
  await deps.session.clearCache();
  await deps.session.clearStorageData({
    storages: [...CLEARED_ELECTRON_STORAGES],
  });
  await deps.session.clearCodeCaches({});
}
