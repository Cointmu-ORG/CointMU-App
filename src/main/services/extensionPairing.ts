import type { IncomingMessage } from "node:http";
import {
  evaluateBridgeAccess,
  isExtensionOrigin,
  type BridgeAccess,
} from "../security/bridgeOrigin";

const PAIRED_ORIGIN_STORE_KEY = "extension.pairedOrigin";
const HTTP_FORBIDDEN = 403;

interface PairingStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

/**
 * @param store - The electron-store instance.
 * @returns The extension origin approved at pairing, or null.
 */
export function readPairedOrigin(store: PairingStore): string | null {
  const value = store.get(PAIRED_ORIGIN_STORE_KEY);
  return isExtensionOrigin(value as string | undefined)
    ? (value as string)
    : null;
}

/**
 * Records the extension origin the user approved.
 * @param store - The electron-store instance.
 * @param origin - The approved extension origin.
 */
export function savePairedOrigin(store: PairingStore, origin: string): void {
  store.set(PAIRED_ORIGIN_STORE_KEY, origin);
}

/**
 * Forgets the paired extension, e.g. after the user unlinks it.
 * @param store - The electron-store instance.
 */
export function clearPairedOrigin(store: PairingStore): void {
  store.delete(PAIRED_ORIGIN_STORE_KEY);
}

/**
 * @param store - The electron-store instance.
 * @returns A function classifying a handshake origin against the current pairing.
 */
export function createPairedOriginCheck(
  store: PairingStore,
): (origin: string | undefined) => BridgeAccess {
  return (origin) => evaluateBridgeAccess(origin, readPairedOrigin(store));
}

/**
 * ws verifyClient hook that refuses any handshake not coming from a browser
 * extension, so web pages cannot even open the socket.
 * @param info - The handshake details from ws.
 * @param callback - Accepts or refuses the handshake.
 */
export function verifyExtensionClient(
  info: { origin: string; req: IncomingMessage },
  callback: (result: boolean, code?: number, message?: string) => void,
): void {
  if (isExtensionOrigin(info.origin)) {
    callback(true);
    return;
  }
  callback(false, HTTP_FORBIDDEN, "Forbidden origin");
}
