import type { MiningAutoStartState } from "@bridge/types";

/**
 * Follows "Start mining at launch": the current state first (the countdown
 * may have begun before the window loaded), then every change.
 * @param callback - Called with each state.
 * @returns Stops following.
 */
export function subscribeAutoStart(
  callback: (state: MiningAutoStartState) => void,
): () => void {
  let isActive = true;
  window.api.mining
    .getAutoStart()
    .then((state) => {
      if (isActive) callback(state);
    })
    .catch((err: unknown) => {
      console.error("Failed to read the mining auto-start", err);
    });
  const unsubscribe = window.api.mining.onAutoStartChanged(callback);
  return () => {
    isActive = false;
    unsubscribe();
  };
}

/**
 * Cancels the automatic start for this session.
 * @returns Resolves once main has cancelled it.
 */
export function cancelAutoStart(): Promise<void> {
  return window.api.mining.cancelAutoStart();
}
