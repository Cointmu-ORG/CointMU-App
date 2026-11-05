"use strict";

import "./protocol.js";
import { createApprovalQueue } from "./approval-queue.js";

/**
 * Lifecycle of dApp requests that wait for the user in the approval popup:
 * opening the popup, expiry, and cleanup when the tab or popup closes.
 */

const { ErrorCode } = globalThis.CointMUProtocol;

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
const POPUP_WIDTH_PX = 360;
const POPUP_HEIGHT_PX = 700;
const POPUP_PATH = "popup/popup.html";
const APPROVE_MODE = "approve";

const queue = createApprovalQueue({ timeoutMs: APPROVAL_TIMEOUT_MS });

/**
 * @param {Function} sendResponse - The content-script reply callback.
 * @param {unknown} result - The JSON-RPC result.
 */
export function replyResult(sendResponse, result) {
  sendResponse({ result, error: null });
}

/**
 * @param {Function} sendResponse - The content-script reply callback.
 * @param {number} code - An EIP-1193 or JSON-RPC error code.
 * @param {string} message - Shown to the dApp.
 */
export function replyError(sendResponse, code, message) {
  sendResponse({ result: null, error: { code, message } });
}

function closeWindow(windowId) {
  if (windowId === null) return;
  chrome.windows.remove(windowId).catch(() => {
    // Already closed by the user; nothing left to clean up.
  });
}

function rejectRemoved(entries, message) {
  for (const entry of entries) {
    replyError(entry.sendResponse, ErrorCode.USER_REJECTED, message);
    closeWindow(entry.windowId);
  }
}

function sweepExpired() {
  rejectRemoved(
    queue.removeExpired(),
    "The request expired before it was approved.",
  );
}

/**
 * Queues a request and opens the approval popup for it.
 * @param {Object} pending - tabId, frameId, requestId, origin, method, request, sendResponse.
 * @returns {Promise<void>}
 */
export async function enqueueApproval(pending) {
  const entry = queue.add(pending);
  setTimeout(sweepExpired, APPROVAL_TIMEOUT_MS);
  const popup = await chrome.windows.create({
    url: chrome.runtime.getURL(
      `${POPUP_PATH}?mode=${APPROVE_MODE}&reqId=${encodeURIComponent(entry.id)}`,
    ),
    type: "popup",
    width: POPUP_WIDTH_PX,
    height: POPUP_HEIGHT_PX,
  });
  queue.attachWindow(entry.id, popup.id);
}

/**
 * @param {string} origin
 * @param {string} method
 * @returns {boolean} True when the origin already waits on this method.
 */
export function hasPendingApproval(origin, method) {
  return queue.hasPending(origin, method);
}

/**
 * @param {string} id - The popup's reqId.
 * @returns {Object | null} The live entry, left in the queue.
 */
export function peekApproval(id) {
  return queue.peek(id);
}

/**
 * @param {string} id - The popup's reqId.
 * @returns {Object | null} The entry, removed so it cannot be resolved twice.
 */
export function takeApproval(id) {
  return queue.take(id);
}

/**
 * @param {unknown} url - A sender URL.
 * @returns {URL | null} The URL when it is this extension's popup page.
 */
function parsePopupUrl(url) {
  if (typeof url !== "string") return null;
  // Compared as text: URL.origin is "null" for non-special schemes such as
  // chrome-extension: outside Chrome.
  const page = url.split(/[?#]/, 1)[0];
  return page === chrome.runtime.getURL(POPUP_PATH) ? new URL(url) : null;
}

/**
 * Accepts only an approval window this queue opened: the popup page in
 * approve mode, inside a window that a live request is waiting on.
 * @param {chrome.runtime.MessageSender} sender
 * @returns {boolean} True when the message comes from one of our approval windows.
 */
export function isFromApprovalPopup(sender) {
  return (
    sender.id === chrome.runtime.id &&
    parsePopupUrl(sender.url)?.searchParams.get("mode") === APPROVE_MODE &&
    queue.hasWindow(sender.tab?.windowId)
  );
}

/**
 * Accepts only the toolbar popup: this extension's popup page, outside any
 * tab. Content scripts always have a tab and a web page URL.
 * @param {chrome.runtime.MessageSender} sender
 * @returns {boolean} True when the message comes from the toolbar popup.
 */
export function isFromPopupPage(sender) {
  return (
    sender.id === chrome.runtime.id &&
    sender.tab === undefined &&
    parsePopupUrl(sender.url) !== null
  );
}

/**
 * Drops the requests of a closed tab and closes their popups.
 * @param {number} tabId
 */
export function handleTabRemoved(tabId) {
  for (const entry of queue.removeByTab(tabId)) {
    closeWindow(entry.windowId);
  }
}

/**
 * Rejects a request whose approval popup was closed without an answer.
 * @param {number} windowId
 */
export function handleWindowRemoved(windowId) {
  for (const entry of queue.removeByWindow(windowId)) {
    replyError(
      entry.sendResponse,
      ErrorCode.USER_REJECTED,
      "User closed the approval window.",
    );
  }
}
