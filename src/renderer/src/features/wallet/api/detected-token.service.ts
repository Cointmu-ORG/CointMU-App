import type { DetectedTokens } from "@bridge/types";

/**
 * @param account - A wallet account address.
 * @returns The account's auto-detected tokens and the scan progress.
 */
export function getDetectedTokens(account: string): Promise<DetectedTokens> {
  return window.api.tokens.getDetected(account);
}

/**
 * Calls back after the background scan changed detections, balances or saw
 * a new head.
 * @returns Unsubscribe.
 */
export function onDetectedTokensChanged(callback: () => void): () => void {
  return window.api.tokens.onChanged(callback);
}
