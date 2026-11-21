/** @returns True while the launch-time node startup still runs. */
export function isNodeStarting(): Promise<boolean> {
  return window.api.node.isStarting();
}

/**
 * @param callback - Invoked once the launch-time node startup is over.
 * @returns A function that removes the subscription.
 */
export function subscribeNodeStartupDone(callback: () => void): () => void {
  return window.api.node.onStartupDone(callback);
}
