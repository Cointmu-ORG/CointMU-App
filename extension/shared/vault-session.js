"use strict";

/**
 * Holds the unlocked wallet keys for the browser session. They live in this
 * worker's memory and in chrome.storage.session (memory-only, restricted to
 * extension pages), so an idle service worker that Chrome restarts stays
 * unlocked until the auto-lock deadline or until the browser closes.
 */

export const AUTO_LOCK_MS = 15 * 60 * 1000;
export const AUTO_LOCK_ALARM = "cointmu-auto-lock";
const SESSION_KEY = "unlockedWallet";
const TRUSTED_CONTEXTS = "TRUSTED_CONTEXTS";

/** @type {{ keys: Array<{ address: string, privateKey: string }>, lockAt: number } | null} */
let session = null;

/**
 * Starts or extends the session: the auto-lock deadline moves to
 * AUTO_LOCK_MS from now.
 * @param {Array<{ address: string, privateKey: string }>} keys
 * @param {number} [now] - Epoch ms.
 * @returns {Promise<void>}
 */
export async function openSession(keys, now = Date.now()) {
  // Content scripts must never read the session area (Chrome's default, made explicit).
  await chrome.storage.session.setAccessLevel({
    accessLevel: TRUSTED_CONTEXTS,
  });
  const next = { keys, lockAt: now + AUTO_LOCK_MS };
  session = next;
  await chrome.storage.session.set({ [SESSION_KEY]: next });
  await chrome.alarms.create(AUTO_LOCK_ALARM, { when: next.lockAt });
}

/**
 * @param {number} [now] - Epoch ms.
 * @returns {Promise<Array<{ address: string, privateKey: string }> | null>}
 * The unlocked keys, or null when locked. A session past its deadline is
 * closed here, even if the alarm has not fired yet.
 */
export async function readSession(now = Date.now()) {
  if (!session) {
    const stored = await chrome.storage.session.get(SESSION_KEY);
    // An unlock may have finished while this read was waiting; keep it.
    session ??= stored[SESSION_KEY] ?? null;
  }
  if (!session) return null;
  if (now >= session.lockAt) {
    await closeSession();
    return null;
  }
  return session.keys;
}

/**
 * Forgets the unlocked keys.
 * @returns {Promise<void>}
 */
export async function closeSession() {
  session = null;
  await chrome.storage.session.remove(SESSION_KEY);
  await chrome.alarms.clear(AUTO_LOCK_ALARM);
}
