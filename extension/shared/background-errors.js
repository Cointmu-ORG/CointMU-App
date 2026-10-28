"use strict";

/**
 * Errors the background sends to the popup as codes, so the popup shows them
 * in its language. Errors returned to dApps stay English provider errors
 * (EIP-1193: dApps branch on the numeric code, and the message is read by
 * developers).
 */
export const BackgroundErrorCode = Object.freeze({
  DESKTOP_UNREACHABLE: "DESKTOP_UNREACHABLE",
  DESKTOP_NOT_CONNECTED: "DESKTOP_NOT_CONNECTED",
  IMPORT_FAILED: "IMPORT_FAILED",
  STORAGE_SAVE_FAILED: "STORAGE_SAVE_FAILED",
  NO_ACTIVE_ADDRESS: "NO_ACTIVE_ADDRESS",
  PRIVATE_KEY_NOT_FOUND: "PRIVATE_KEY_NOT_FOUND",
  NETWORK_NOT_FOUND: "NETWORK_NOT_FOUND",
  PROVIDER_FAILED: "PROVIDER_FAILED",
  TX_FAILED: "TX_FAILED",
});

// Literal keys, so i18n:audit can match them against en.json.
const ERROR_KEYS = Object.freeze({
  DESKTOP_UNREACHABLE: "extension.wallet.desktopUnreachable",
  DESKTOP_NOT_CONNECTED: "extension.errors.desktopNotConnected",
  IMPORT_FAILED: "extension.wallet.importFailed",
  STORAGE_SAVE_FAILED: "extension.errors.storageSaveFailed",
  NO_ACTIVE_ADDRESS: "extension.errors.noActiveAddress",
  PRIVATE_KEY_NOT_FOUND: "extension.errors.privateKeyNotFound",
  NETWORK_NOT_FOUND: "extension.errors.networkNotFound",
  PROVIDER_FAILED: "extension.errors.providerFailed",
  TX_FAILED: "extension.errors.txFailed",
});

/**
 * Builds a failed response for the popup.
 * @param {string} code - A BackgroundErrorCode.
 * @param {string} [detail] - Technical detail (an ethers or node message),
 * shown as is because it is only meaningful in its original wording.
 * @returns {{ success: false, errorCode: string, detail?: string }}
 */
export function backgroundError(code, detail) {
  return detail
    ? { success: false, errorCode: code, detail }
    : { success: false, errorCode: code };
}

/**
 * Turns a failed background response into text for the popup.
 * @param {{ errorCode?: string, detail?: string } | undefined} response
 * @param {Object<string, string>} translations - Flattened locale strings.
 * @returns {string} The detail when there is one, else the translated code.
 */
export function describeBackgroundError(response, translations) {
  if (response?.detail) return response.detail;
  const key = Object.hasOwn(ERROR_KEYS, response?.errorCode ?? "")
    ? ERROR_KEYS[response.errorCode]
    : "extension.wallet.unknownError";
  return (
    translations[key] ||
    translations["extension.wallet.unknownError"] ||
    "Unknown error"
  );
}
