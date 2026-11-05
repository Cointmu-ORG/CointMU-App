"use strict";

import { BackgroundErrorCode, backgroundError } from "./background-errors.js";
import { isFromPopupPage } from "./dapp-approvals.js";
import {
  handleApprovalResolution,
  handleContentMessage,
  handlePendingRequestQuery,
} from "./dapp-requests.js";
import { handleInternalMessage } from "./wallet.js";

/**
 * Routes chrome.runtime messages by sender. Messages without an `action` are
 * dApp JSON-RPC requests relayed by the content script. Approval actions
 * check that they come from one of our approval windows; every other action
 * is accepted only from the toolbar popup, never from a content script.
 */

/** Actions answered for the approval window; each handler checks the sender. */
const APPROVAL_HANDLERS = Object.freeze({
  GET_PENDING_REQ: handlePendingRequestQuery,
  RESOLVE_REQ: handleApprovalResolution,
});

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
  if (Object.hasOwn(APPROVAL_HANDLERS, action)) {
    return APPROVAL_HANDLERS[action](message, sender, sendResponse);
  }
  if (!isFromPopupPage(sender)) {
    sendResponse(backgroundError(BackgroundErrorCode.FORBIDDEN_SENDER));
    return false;
  }
  return handleInternalMessage(message, sender, sendResponse);
}
