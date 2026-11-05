"use strict";

import { BackgroundErrorCode, backgroundError } from "./background-errors.js";
import { isFromApprovalPopup, isFromPopupPage } from "./dapp-approvals.js";
import {
  handleApprovalResolution,
  handleContentMessage,
  handlePendingRequestQuery,
} from "./dapp-requests.js";
import { handleInternalMessage } from "./wallet.js";
import { VAULT_HANDLERS } from "./wallet-vault.js";
import { handleMigrateMessage } from "./vault-migration.js";

/**
 * Routes chrome.runtime messages by sender. Messages without an `action` are
 * dApp JSON-RPC requests relayed by the content script. An approval window we
 * opened may only read and answer its request and unlock the wallet; every
 * other action is accepted only from the toolbar popup, never from a content
 * script.
 */

const APPROVAL_WINDOW_HANDLERS = Object.freeze({
  GET_PENDING_REQ: handlePendingRequestQuery,
  RESOLVE_REQ: handleApprovalResolution,
  UNLOCK: VAULT_HANDLERS.UNLOCK,
});

/** Vault actions for the toolbar popup; other actions go to wallet.js. */
const POPUP_VAULT_HANDLERS = Object.freeze({
  ...VAULT_HANDLERS,
  MIGRATE_VAULT: handleMigrateMessage,
});

function ownHandler(handlers, action) {
  return Object.hasOwn(handlers, action) ? handlers[action] : null;
}

/**
 * @param {string} action
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Function | null} The handler this sender may use, or null.
 */
function pickHandler(action, sender) {
  if (isFromApprovalPopup(sender)) {
    return ownHandler(APPROVAL_WINDOW_HANDLERS, action);
  }
  if (isFromPopupPage(sender)) {
    return ownHandler(POPUP_VAULT_HANDLERS, action) ?? handleInternalMessage;
  }
  return null;
}

/**
 * @param {any} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {Function} sendResponse
 * @returns {boolean} True to keep the channel open for an async reply.
 */
export function handleRuntimeMessage(message, sender, sendResponse) {
  const action = message?.action;
  if (typeof action !== "string") {
    return handleContentMessage(message, sender, sendResponse);
  }
  const handler = pickHandler(action, sender);
  if (!handler) {
    sendResponse(backgroundError(BackgroundErrorCode.FORBIDDEN_SENDER));
    return false;
  }
  return handler(message, sender, sendResponse);
}
