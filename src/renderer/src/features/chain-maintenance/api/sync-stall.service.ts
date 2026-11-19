import type { SyncStallStep } from "@bridge/types";

/**
 * Subscribes to sync stall steps broadcast by the main process.
 * @param callback - Invoked with every new step, or null when sync recovers.
 * @returns A function that removes the subscription.
 */
export function subscribeSyncStall(
  callback: (step: SyncStallStep | null) => void,
): () => void {
  return window.api.node.onSyncStall(callback);
}

/** @returns The step under way, so a late view can catch up. */
export function getSyncStall(): Promise<SyncStallStep | null> {
  return window.api.node.getSyncStall();
}
