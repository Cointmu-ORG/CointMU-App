"use strict";

import { BackgroundErrorCode, BackgroundFailure } from "./background-errors.js";
import { isSameAddress } from "./signing-request.js";
import { encryptVault } from "./vault-crypto.js";
import { openSession } from "./vault-session.js";
import {
  announceLockChange,
  checkNewPassword,
  openVault,
  plaintextWallets,
  publicWalletList,
  replyWhenSettled,
  textField,
} from "./wallet-vault.js";

/**
 * Moves the plain-text keys that versions up to 1.0.17 stored in
 * storage.local.wallets into the encrypted vault. The plain-text copies are
 * removed only after the stored vault has been read back and decrypted to
 * the same keys, so an interruption at any step loses nothing and the
 * migration can simply run again.
 */

/**
 * @param {Array<{ address: string, privateKey: string }>} first
 * @param {Array<{ address: string, privateKey: string }>} more
 * @returns {Array<{ address: string, privateKey: string }>} first, then the
 * keys of `more` whose address is not in `first`.
 */
function mergeKeys(first, more) {
  const extra = more.filter(
    (key) => !first.some((known) => isSameAddress(known.address, key.address)),
  );
  return [...first, ...extra];
}

function isSameKeyList(a, b) {
  return (
    a.length === b.length &&
    a.every(
      (key, i) =>
        key.address === b[i].address &&
        key.privateKey.toLowerCase() === b[i].privateKey.toLowerCase(),
    )
  );
}

/**
 * Encrypts every plain-text key, verifies the stored vault, then removes the
 * plain text. Does nothing when there is nothing left to migrate.
 * @param {{ password: string, confirmPassword: string }} input - The
 * password of the vault left by an interrupted run, or a new one.
 * @returns {Promise<void>}
 * @throws {BackgroundFailure} WEAK_PASSWORD, PASSWORD_MISMATCH,
 * WRONG_PASSWORD or VAULT_DAMAGED; the plain-text keys stay in place.
 */
export async function migrateLegacyWallets({ password, confirmPassword }) {
  const { wallets, vault } = await chrome.storage.local.get([
    "wallets",
    "vault",
  ]);
  const legacy = plaintextWallets(wallets);
  if (legacy.length === 0) return;
  if (!vault) checkNewPassword(password, confirmPassword);
  const existing = vault ? await openVault(vault, password) : [];
  const keys = mergeKeys(legacy, existing);

  // 1. Write the vault next to the plain text, which stays untouched.
  await chrome.storage.local.set({ vault: await encryptVault(keys, password) });
  // 2. Read it back and prove it decrypts to the same keys.
  const stored = await chrome.storage.local.get(["vault"]);
  if (!isSameKeyList(await openVault(stored.vault, password), keys)) {
    throw new BackgroundFailure(BackgroundErrorCode.VAULT_DAMAGED);
  }
  // 3. Only now replace the plain-text list with addresses.
  await chrome.storage.local.set({ wallets: publicWalletList(keys) });
  await openSession(keys);
  await announceLockChange();
}

/**
 * MIGRATE_VAULT from the toolbar popup.
 * @param {Object} message - password, confirmPassword.
 * @param {chrome.runtime.MessageSender} _sender - Checked by the router.
 * @param {Function} sendResponse
 * @returns {boolean} True: the reply is asynchronous.
 */
export function handleMigrateMessage(message, _sender, sendResponse) {
  return replyWhenSettled(
    sendResponse,
    migrateLegacyWallets({
      password: textField(message, "password"),
      confirmPassword: textField(message, "confirmPassword"),
    }),
  );
}
