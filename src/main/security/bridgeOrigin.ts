/**
 * Origin rules for the local WebSocket bridges. Browsers always send the real
 * Origin header on a WebSocket handshake, so a web page cannot pose as the
 * extension. Only a Chromium extension origin may connect, and only the one
 * the user approved during pairing may use the bridge.
 */

const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/;

export const BridgeAccess = {
  REJECTED: "rejected",
  UNPAIRED: "unpaired",
  PAIRED: "paired",
} as const;

export type BridgeAccess = (typeof BridgeAccess)[keyof typeof BridgeAccess];

export const BRIDGE_NOT_PAIRED_MESSAGE =
  "CointMU Desktop: this browser extension is not paired. Update the CointMU extension, then pair it again from the extension popup.";

/**
 * @param origin - The Origin header of a WebSocket handshake.
 * @returns True for a Chromium extension origin.
 */
export function isExtensionOrigin(origin: string | undefined): boolean {
  return typeof origin === "string" && EXTENSION_ORIGIN_PATTERN.test(origin);
}

/**
 * Classifies a bridge client by its handshake origin.
 * @param origin - The Origin header of the handshake.
 * @param pairedOrigin - The extension origin stored at pairing, if any.
 * @returns Whether the client is rejected, may only pair, or is fully paired.
 */
export function evaluateBridgeAccess(
  origin: string | undefined,
  pairedOrigin: string | null,
): BridgeAccess {
  if (!isExtensionOrigin(origin)) return BridgeAccess.REJECTED;
  return origin === pairedOrigin ? BridgeAccess.PAIRED : BridgeAccess.UNPAIRED;
}
