import type { NodeStopWait } from "@bridge/types";

/**
 * Subscribes to a stop that waits for geth's startup repair.
 * @param callback - Invoked with the wait, or null once it is over.
 * @returns A function that removes the subscription.
 */
export function subscribeNodeStopWait(
  callback: (wait: NodeStopWait | null) => void,
): () => void {
  return window.api.node.onStopWait(callback);
}
