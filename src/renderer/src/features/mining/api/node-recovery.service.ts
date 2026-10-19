import type { NodeRecoveryEvent } from "@bridge/types";

type Unsubscribe = () => void;

/**
 * Subscribes to staged node recovery events broadcast by the main process.
 * @param callback - Invoked with every recovery event.
 * @returns A function that removes the subscription.
 */
function subscribeNodeRecovery(
  callback: (event: NodeRecoveryEvent) => void,
): Unsubscribe {
  return window.api.node.onRecovery(callback);
}

/**
 * Fetches the recovery event that is still active, so a window opened after
 * the broadcast (e.g. a startup port conflict) still shows it.
 * @returns The active event, or null when the node is not in recovery.
 */
async function getNodeRecoveryState(): Promise<NodeRecoveryEvent | null> {
  return window.api.node.getRecoveryState();
}

/**
 * Clears a blocked or failed recovery state and restarts the node.
 * @returns A promise resolving once the restart is dispatched.
 */
async function retryNode(): Promise<void> {
  return window.api.node.retry();
}

export { subscribeNodeRecovery, getNodeRecoveryState, retryNode };
