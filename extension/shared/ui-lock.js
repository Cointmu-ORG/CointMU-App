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
 * Wires a button that resets the vault after a confirmation: under the unlock
 * form (forgotten password) or the migrate form (restart an interrupted run).
 * @param {HTMLButtonElement} button
 * @param {{ message: string, title: string }} prompt - Translated texts.
 * @param {(message: string, title?: string) => Promise<boolean>} confirm
 */
export function bindResetButton(button, prompt, confirm) {
  button.addEventListener("click", async () => {
    if (await confirm(prompt.message, prompt.title)) {
      chrome.runtime.sendMessage({ action: "RESET_VAULT" });
    }
  });
}

/**
 * Wires the form that encrypts the plain-text keys of an older version.
 * @param {Object} options
 * @param {HTMLFormElement} options.form
 * @param {HTMLInputElement} options.password
 * @param {HTMLInputElement} options.confirm
 * @param {HTMLElement} options.error
 * @param {HTMLButtonElement} options.button
 * @param {Object<string, string>} options.translations
 * @param {(password: string, confirmPassword: string) => string | null} options.check
 * Returns why the fields are not usable, or null.
 * @param {() => void} options.onDone
 */
export function bindMigrateForm({
  form,
  password,
  confirm,
  error,
  button,
  translations,
  check,
  onDone,
}) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const problem = check(password.value, confirm.value);
    showFormError(error, problem);
    if (problem) return;
    const res = await sendVaultAction({
      message: {
        action: "MIGRATE_VAULT",
        password: password.value,
        confirmPassword: confirm.value,
      },
      button,
      busyText: t(
        translations,
        "extension.vault.encrypting",
        "Encrypting your keys...",
      ),
    });
    if (res?.success) {
      password.value = "";
      confirm.value = "";
      onDone();
      return;
    }
    showFormError(error, describeBackgroundError(res, translations));
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
