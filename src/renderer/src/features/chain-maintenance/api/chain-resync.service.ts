import type { ChainResyncInfo, ChainResyncResult } from "@bridge/types";

/** @returns The chain data and backup sizes, measured by main. */
export function getResyncInfo(): Promise<ChainResyncInfo> {
  return window.api.chainData.getResyncInfo();
}

/** Asks main to re-download the chain from genesis. */
export function resyncChain(): Promise<ChainResyncResult> {
  return window.api.chainData.resync();
}

/** Asks main to delete the quarantined chain data. */
export function deleteChainBackup(): Promise<void> {
  return window.api.chainData.deleteBackup();
}
