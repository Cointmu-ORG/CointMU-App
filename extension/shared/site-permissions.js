"use strict";

/**
 * Origins the user connected through an approved eth_requestAccounts. Signing
 * requests from any other origin are refused without opening a popup.
 */

const CONNECTED_ORIGINS_KEY = "connectedOrigins";
const ALLOWED_SCHEMES = ["https:", "http:"];

/**
 * @param {unknown} origin - A candidate origin string.
 * @returns {boolean} True for a serialized http(s) origin; false for opaque
 * ("null"), file: and anything that is not exactly an origin.
 */
export function isValidOrigin(origin) {
  if (typeof origin !== "string") return false;
  try {
    const url = new URL(origin);
    return ALLOWED_SCHEMES.includes(url.protocol) && url.origin === origin;
  } catch {
    return false;
  }
}

/**
 * @param {string[]} origins - The connected origins.
 * @param {string} origin - The origin to check.
 * @returns {boolean} True when the origin is connected.
 */
export function isOriginConnected(origins, origin) {
  return isValidOrigin(origin) && origins.includes(origin);
}

/**
 * @param {string[]} origins - The connected origins.
 * @param {string} origin - The origin to add.
 * @returns {string[]} A new list that includes the origin once.
 */
export function withOrigin(origins, origin) {
  return origins.includes(origin) ? origins : [...origins, origin];
}

/**
 * @param {string[]} origins - The connected origins.
 * @param {string} origin - The origin to remove.
 * @returns {string[]} A new list without the origin.
 */
export function withoutOrigin(origins, origin) {
  return origins.filter((item) => item !== origin);
}

/**
 * @param {string | undefined} url - A tab URL.
 * @returns {string | null} Its origin, or null when it has no usable URL.
 */
function originOfUrl(url) {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Picks the tabs whose page belongs to a connected origin, e.g. to deliver
 * account changes only to sites the user connected.
 * @param {Array<{ id?: number, url?: string }>} tabs - From chrome.tabs.query.
 * @param {string[]} origins - The connected origins.
 * @returns {number[]} The ids of the matching tabs.
 */
export function selectConnectedTabIds(tabs, origins) {
  return tabs
    .filter(
      (tab) =>
        tab.id !== undefined &&
        isOriginConnected(origins, originOfUrl(tab.url)),
    )
    .map((tab) => tab.id);
}

/**
 * @returns {Promise<string[]>} The stored connected origins.
 */
export async function getConnectedOrigins() {
  const res = await chrome.storage.local.get([CONNECTED_ORIGINS_KEY]);
  const stored = res[CONNECTED_ORIGINS_KEY];
  return Array.isArray(stored) ? stored.filter(isValidOrigin) : [];
}

/**
 * Records an origin the user just approved.
 * @param {string} origin - The approved origin.
 * @returns {Promise<void>}
 */
export async function addConnectedOrigin(origin) {
  if (!isValidOrigin(origin)) return;
  const origins = await getConnectedOrigins();
  await chrome.storage.local.set({
    [CONNECTED_ORIGINS_KEY]: withOrigin(origins, origin),
  });
}

/**
 * Forgets an origin, e.g. after the desktop app revoked it.
 * @param {string} origin - The origin to remove.
 * @returns {Promise<void>}
 */
export async function removeConnectedOrigin(origin) {
  const origins = await getConnectedOrigins();
  await chrome.storage.local.set({
    [CONNECTED_ORIGINS_KEY]: withoutOrigin(origins, origin),
  });
}
