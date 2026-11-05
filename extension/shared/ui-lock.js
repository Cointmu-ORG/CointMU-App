"use strict";

import { describeBackgroundError } from "./background-errors.js";

/**
 * Popup side of the wallet lock: unlock forms, the lock and reset buttons,
 * and the password prompt for vault writes. The popup only ever sends a
 * password to the background; it never receives a key.
 */

/** Sent by the background (wallet-vault.js) when the lock state changes. */
export const WALLET_LOCK_CHANGED = "WALLET_LOCK_CHANGED";

const t = (translations, key, fallback) => translations[key] || fallback;

/**
 * Disables a button and shows progress text while the background derives the
 * vault key (PBKDF2 takes a noticeable moment).
 * @param {HTMLButtonElement} button
 * @param {string} busyText
 * @returns {() => void} Restores the button.
 */
export function setBusy(button, busyText) {
  const label = button.querySelector("span") ?? button;
  const idleText = label.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  label.textContent = busyText;
  return () => {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    label.textContent = idleText;
  };
}

/**
 * @param {HTMLElement} element
 * @param {string | null} text - Null hides the message.
 */
export function showFormError(element, text) {
  element.textContent = text ?? "";
  element.classList.toggle("hidden", !text);
}

/**
 * Sends a vault action and shows a busy button until it settles.
 * @param {Object} options
 * @param {Object} options.message - The runtime message.
 * @param {HTMLButtonElement} options.button
 * @param {string} options.busyText
 * @returns {Promise<Object | undefined>} The background's reply.
 */
export async function sendVaultAction({ message, button, busyText }) {
  const restore = setBusy(button, busyText);
  try {
    return await chrome.runtime.sendMessage(message);
  } finally {
    restore();
  }
}

/**
 * Wires a password form that unlocks the wallet.
 * @param {Object} options
 * @param {HTMLFormElement} options.form
 * @param {HTMLInputElement} options.input
 * @param {HTMLElement} options.error
 * @param {HTMLButtonElement} options.button
 * @param {Object<string, string>} options.translations
 * @param {() => void} options.onUnlocked
 */
export function bindUnlockForm({
  form,
  input,
  error,
  button,
  translations,
  onUnlocked,
}) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!input.value) return;
    showFormError(error, null);
    const res = await sendVaultAction({
      message: { action: "UNLOCK", password: input.value },
      button,
      busyText: t(translations, "extension.vault.unlocking", "Unlocking..."),
    });
    if (res?.success) {
      input.value = "";
      onUnlocked();
      return;
    }
    showFormError(error, describeBackgroundError(res, translations));
    input.select();
  });
}

/**
 * @param {HTMLButtonElement} button - The header lock button.
 */
export function bindLockButton(button) {
  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "LOCK" });
  });
}

/**
 * Wires the reset button shown under the unlock form.
 * @param {HTMLButtonElement} button
 * @param {Object<string, string>} translations
 * @param {(message: string, title?: string) => Promise<boolean>} confirm
 */
export function bindResetButton(button, translations, confirm) {
  button.addEventListener("click", async () => {
    const isConfirmed = await confirm(
      t(
        translations,
        "extension.vault.resetConfirm",
        "This removes every imported wallet from this browser. You will need your private keys to import them again. Continue?",
      ),
      t(translations, "extension.vault.resetBtn", "Reset Wallet"),
    );
    if (isConfirmed) chrome.runtime.sendMessage({ action: "RESET_VAULT" });
  });
}

/**
 * Asks for the wallet password in the confirm modal.
 * @param {Object<string, string>} translations
 * @param {string} message - What the password is for.
 * @returns {Promise<string | null>} The password, or null when cancelled.
 */
export function askPassword(translations, message) {
  const modal = document.getElementById("confirm-modal");
  const title = document.getElementById("confirm-modal-title");
  const text = document.getElementById("confirm-modal-message");
  const group = document.getElementById("confirm-modal-password-group");
  const input = document.getElementById("confirm-modal-password");
  const cancelBtn = document.getElementById("confirm-modal-cancel");
  const confirmBtn = document.getElementById("confirm-modal-confirm");

  title.textContent = t(
    translations,
    "extension.wallet.confirmTitle",
    "Are you sure?",
  );
  text.textContent = message;
  input.value = "";
  group.classList.remove("hidden");
  modal.classList.remove("hidden");
  input.focus();

  return new Promise((resolve) => {
    const finish = (result) => {
      modal.classList.add("hidden");
      group.classList.add("hidden");
      input.value = "";
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onConfirm = () => {
      if (input.value) finish(input.value);
    };
    const onCancel = () => finish(null);
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}
