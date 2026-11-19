import type { DagInfo } from "@bridge/types";
import { clearLocalCaches } from "@/shared/lib";

/**
 * Clears every rebuildable cache: main's (explorer index, token/NFT scan
 * state, NFT media, Electron HTTP/code caches), then the renderer's
 * in-memory activity cache.
 */
export async function clearAllCaches(): Promise<void> {
  await window.api.maintenance.clearCache();
  clearLocalCaches();
}

/** @returns The DAG size and whether geth mines. */
export function getDagInfo(): Promise<DagInfo> {
  return window.api.maintenance.getDagInfo();
}

/** Asks main to delete the mining DAG files. */
export function deleteDag(): Promise<void> {
  return window.api.maintenance.deleteDag();
}
