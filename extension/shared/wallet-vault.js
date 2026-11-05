"use strict";

import {
  BackgroundErrorCode,
  BackgroundFailure,
  backgroundError,
} from "./background-errors.js";
import { isSameAddress } from "./signing-request.js";
import {
  PBKDF2_ITERATIONS,
  VaultError,
  VaultErrorCode,
  decryptVault,
  encryptVault,
  isAcceptablePassword,
} from "./vault-crypto.js";
import {
  AUTO_LOCK_ALARM,
  closeSession,
  openSession,
  readSession,
} from "./vault-session.js";
import { notifyConnectedTabs } from "./wallet.js";

/**
 * The standalone wallet's keys, encrypted at rest in storage.local.vault;
 * storage.local.wallets lists only their addresses. Every vault write needs
 * the password, because each encryption draws a new salt. Unlocked keys stay
 * in the background (vault-session.js) and never go to a page.
 */

const VAULT_KEY = "vault";
const WALLETS_KEY = "wallets";
const STANDALONE_MODE = "standalone";
/** Broadcast to open extension pages so they re-read the lock state. */
export const WALLET_LOCK_CHANGED = "WALLET_LOCK_CHANGED";

/**
 * @param {unknown} wallets - storage.local.wallets.
 * @returns {Array<{ address: string, privateKey: string }>} Entries that an
 * older version stored with the private key in plain text.
 */
export function plaintextWallets(wallets) {
  if (!Array.isArray(wallets)) return [];
  return wallets
    .filter((w) => typeof w?.privateKey === "string")
    .map(({ address, privateKey }) => ({ address, privateKey }));
}

/**
 * @param {unknown} wallets - storage.local.wallets.
 * @returns {boolean} True until the plain-text keys are migrated into the vault.
 */
export function hasPlaintextKeys(wallets) {
  return plaintextWallets(wallets).length > 0;
}

/**
 * @param {Array<{ address: string }>} keys
 * @returns {Array<{ address: string }>} The public wallet list.
 */
export function publicWalletList(keys) {
  return keys.map(({ address }) => ({ address }));
}

/**
 * @param {Object | undefined} vault - The stored vault record.
 * @param {string} password
 * @returns {Promise<Array<{ address: string, privateKey: string }>>}
 * @throws {BackgroundFailure} WRONG_PASSWORD, VAULT_DAMAGED or PRIVATE_KEY_NOT_FOUND.
 */
export async function openVault(vault, password) {
  if (!vault) {
    throw new BackgroundFailure(BackgroundErrorCode.PRIVATE_KEY_NOT_FOUND);
  }
  try {
    return await decryptVault(vault, password);
  } catch (err) {
    if (!(err instanceof VaultError)) throw err;
    throw new BackgroundFailure(
      err.code === VaultErrorCode.WRONG_PASSWORD
        ? BackgroundErrorCode.WRONG_PASSWORD
        : BackgroundErrorCode.VAULT_DAMAGED,
    );
  }
}

/**
 * @param {string} password
 * @param {string} confirmPassword
 * @throws {BackgroundFailure} WEAK_PASSWORD or PASSWORD_MISMATCH.
 */
export function checkNewPassword(password, confirmPassword) {
  if (!isAcceptablePassword(password)) {
    throw new BackgroundFailure(BackgroundErrorCode.WEAK_PASSWORD);
  }
  if (password !== confirmPassword) {
    throw new BackgroundFailure(BackgroundErrorCode.PASSWORD_MISMATCH);
  }
}

/**
 * Encrypts the keys, stores them with their public list in one write, and
 * keeps them unlocked for this session.
 * @param {Array<{ address: string, privateKey: string }>} keys
 * @param {string} password
 * @returns {Promise<void>}
 */
export async function saveKeys(keys, password) {
  // Writing the public list would drop plain-text keys not yet migrated.
  const { wallets } = await chrome.storage.local.get([WALLETS_KEY]);
  if (hasPlaintextKeys(wallets)) {
    throw new BackgroundFailure(BackgroundErrorCode.MIGRATION_REQUIRED);
  }
  const vault = await encryptVault(keys, password);
  await chrome.storage.local.set({
    [VAULT_KEY]: vault,
    [WALLETS_KEY]: publicWalletList(keys),
  });
  await openSession(keys);
}

/**
 * Tells open extension pages, and connected dApps through EIP-1193
 * accountsChanged, that the lock state changed. Desktop mode is not touched.
 * @returns {Promise<void>}
 */
export async function announceLockChange() {
  chrome.runtime.sendMessage({ action: WALLET_LOCK_CHANGED }).catch(() => {
    // No extension page is open; nothing to refresh.
  });
  const state = await chrome.storage.local.get([
    "connectionMode",
    "activeStandaloneAddress",
  ]);
  if (state.connectionMode !== STANDALONE_MODE) return;
  const address = state.activeStandaloneAddress;
  const isOpen = (await readSession()) !== null;
  await notifyConnectedTabs(isOpen && address ? [address] : []);
}

/** @returns {Promise<boolean>} True while the keys are unlocked. */
export async function isUnlocked() {
  return (await readSession()) !== null;
}

/** @returns {Promise<{ hasVault: boolean, isLocked: boolean }>} */
export async function getVaultStatus() {
  const { vault } = await chrome.storage.local.get([VAULT_KEY]);
  return { hasVault: Boolean(vault), isLocked: !(await isUnlocked()) };
}

/**
 * Hands out a key for signing in the background, and counts as activity for
 * the auto-lock.
 * @param {string} address
 * @returns {Promise<string | null>} The key, or null when locked or unknown.
 */
export async function getPrivateKey(address) {
  const keys = await readSession();
  const entry = keys?.find((key) => isSameAddress(key.address, address));
  if (!entry) return null;
  await openSession(keys);
  return entry.privateKey;
}

/**
 * Adds a key to the vault, creating the vault (and its password) first when
 * there is none.
 * @param {{ privateKey: string, password: string, confirmPassword: string }} input
 * @returns {Promise<string>} The imported address.
 */
export async function importKey({ privateKey, password, confirmPassword }) {
  let wallet;
  try {
    wallet = new globalThis.ethers.Wallet(privateKey);
  } catch {
    throw new BackgroundFailure(BackgroundErrorCode.IMPORT_FAILED);
  }
  const { vault } = await chrome.storage.local.get([VAULT_KEY]);
  if (!vault) checkNewPassword(password, confirmPassword);
  const keys = vault ? await openVault(vault, password) : [];
  const isKnown = keys.some((key) =>
    isSameAddress(key.address, wallet.address),
  );
  const next = isKnown
    ? keys
    : [...keys, { address: wallet.address, privateKey: wallet.privateKey }];
  await saveKeys(next, password);
  return wallet.address;
}

/**
 * @param {{ address: string, password: string }} input
 * @returns {Promise<Array<{ address: string }>>} The remaining wallets.
 */
export async function removeKey({ address, password }) {
  const { vault } = await chrome.storage.local.get([VAULT_KEY]);
  const keys = (await openVault(vault, password)).filter(
    (key) => !isSameAddress(key.address, address),
  );
  await saveKeys(keys, password);
  return publicWalletList(keys);
}

/**
 * @param {string} password
 * @returns {Promise<void>}
 */
export async function unlock(password) {
  const { vault } = await chrome.storage.local.get([VAULT_KEY]);
  const keys = await openVault(vault, password);
  if (vault.kdf.iterations < PBKDF2_ITERATIONS) {
    await saveKeys(keys, password); // Re-encrypts with the current KDF cost.
  } else {
    await openSession(keys);
  }
  await announceLockChange();
}

/** @returns {Promise<void>} */
export async function lock() {
  await closeSession();
  await announceLockChange();
}

/**
 * Forgets the vault and its wallets: the way back from a forgotten password
 * is to import the keys again. Plain-text keys still waiting for migration
 * are kept, so an interrupted migration can start over with a new password.
 * @returns {Promise<void>}
 */
export async function resetVault() {
  await closeSession();
  const { wallets, activeStandaloneAddress } = await chrome.storage.local.get([
    WALLETS_KEY,
    "activeStandaloneAddress",
  ]);
  const pending = plaintextWallets(wallets);
  await chrome.storage.local.remove(VAULT_KEY);
  await chrome.storage.local.set({
    [WALLETS_KEY]: pending,
    activeStandaloneAddress: pending.length ? activeStandaloneAddress : null,
  });
  await announceLockChange();
}

/**
 * @param {{ name: string }} alarm - From chrome.alarms.onAlarm.
 * @returns {Promise<void>}
 */
export async function handleAutoLockAlarm(alarm) {
  if (alarm.name !== AUTO_LOCK_ALARM) return;
  if (!(await isUnlocked())) await announceLockChange();
}

/**
 * Replies to the popup when the work settles.
 * @param {Function} sendResponse
 * @param {Promise<Object | void>} work - Resolves with extra reply fields.
 * @returns {boolean} True: the reply is asynchronous.
 */
export function replyWhenSettled(sendResponse, work) {
  work.then(
    (result) => sendResponse({ success: true, ...result }),
    (err) => {
      if (err instanceof BackgroundFailure) {
        sendResponse(backgroundError(err.code));
        return;
      }
      console.error("[CointMU-bg] Wallet vault operation failed:", err);
      sendResponse(backgroundError(BackgroundErrorCode.STORAGE_SAVE_FAILED));
    },
  );
  return true;
}

/**
 * @param {Object} message
 * @param {string} field
 * @returns {string} The field when it is text, else "".
 */
export function textField(message, field) {
  return typeof message[field] === "string" ? message[field] : "";
}

/** Vault actions, keyed by message action. Senders are checked by the router. */
export const VAULT_HANDLERS = Object.freeze({
  UNLOCK: (message, _sender, sendResponse) =>
    replyWhenSettled(sendResponse, unlock(textField(message, "password"))),
  LOCK: (_message, _sender, sendResponse) =>
    replyWhenSettled(sendResponse, lock()),
  RESET_VAULT: (_message, _sender, sendResponse) =>
    replyWhenSettled(sendResponse, resetVault()),
});
