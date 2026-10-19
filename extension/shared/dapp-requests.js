"use strict";

import "./protocol.js";
import {
  enqueueApproval,
  hasPendingApproval,
  isFromApprovalPopup,
  peekApproval,
  replyError,
  replyResult,
  takeApproval,
} from "./dapp-approvals.js";
import { buildApprovalView } from "./approval-view.js";
import { executeSigning, resolveRpcUrl } from "./signing-executor.js";
import {
  isSameAddress,
  isSigningMethod,
  parseChainId,
  parseSigningRequest,
} from "./signing-request.js";
import {
  addConnectedOrigin,
  getConnectedOrigins,
  isOriginConnected,
  isValidOrigin,
} from "./site-permissions.js";
import { socket } from "./socket.js";
import { JSON_RPC_VERSION, pendingCallbacks, pendingKey } from "./wallet.js";

/**
 * Handles JSON-RPC requests from dApp pages (via the content script) and the
 * approval popup's answers. Connection and signing requests need the user's
 * approval; signing additionally needs a connected origin.
 */

const { CONNECT_METHOD, ErrorCode } = globalThis.CointMUProtocol;

const TOP_FRAME_ID = 0;
const STATE_KEYS = [
  "connectionMode",
  "activeStandaloneAddress",
  "wallets",
  "activeNetworkId",
  "customNetworks",
];
const STANDALONE_MODE = "standalone";
const DESKTOP_SIGNING_MESSAGE =
  "Signing is not supported in desktop mode yet. Switch the CointMU extension to standalone mode to sign.";

function readSender(sender) {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return null;
  let origin = sender.origin;
  if (!origin && sender.url) origin = new URL(sender.url).origin;
  return { tabId, frameId: sender.frameId ?? TOP_FRAME_ID, origin };
}

function activeNetwork(state) {
  return (state.customNetworks || []).find(
    (n) => n.id === state.activeNetworkId,
  );
}

function signingContext(state) {
  return {
    activeAddress: state.activeStandaloneAddress || null,
    chainId: parseChainId(activeNetwork(state)?.chainId),
  };
}

function forwardToDesktop(request, sendResponse) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    replyError(
      sendResponse,
      ErrorCode.INTERNAL_ERROR,
      "CointMU desktop wallet is not connected.",
    );
    return;
  }
  pendingCallbacks.set(
    pendingKey(request.tabId, request.requestId),
    sendResponse,
  );
  socket.send(
    JSON.stringify({
      jsonrpc: JSON_RPC_VERSION,
      id: request.requestId,
      method: request.method,
      params: request.params,
      __tabId: request.tabId,
      origin: request.origin,
    }),
  );
}

async function forwardToCustomRpc(request, state, sendResponse) {
  if (request.method === "eth_accounts") {
    const address = state.activeStandaloneAddress;
    replyResult(sendResponse, address ? [address] : []);
    return;
  }
  const network = activeNetwork(state);
  if (!network) {
    replyError(
      sendResponse,
      ErrorCode.UNAUTHORIZED,
      "No active custom network found.",
    );
    return;
  }
  const response = await fetch(resolveRpcUrl(network), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: JSON_RPC_VERSION,
      id: request.requestId,
      method: request.method,
      params: request.params,
    }),
  });
  const json = await response.json();
  sendResponse({ result: json.result ?? null, error: json.error ?? null });
}

async function handleConnect(request, state, sendResponse) {
  if (!isValidOrigin(request.origin)) {
    replyError(
      sendResponse,
      ErrorCode.UNAUTHORIZED,
      "This page cannot connect a wallet.",
    );
    return;
  }
  const isStandalone = state.connectionMode === STANDALONE_MODE;
  if (isStandalone && !state.activeStandaloneAddress) {
    replyError(
      sendResponse,
      ErrorCode.UNAUTHORIZED,
      "Import a wallet in the CointMU extension first.",
    );
    return;
  }
  if (isOriginConnected(await getConnectedOrigins(), request.origin)) {
    if (isStandalone) {
      replyResult(sendResponse, [state.activeStandaloneAddress]);
    } else {
      forwardToDesktop(request, sendResponse);
    }
    return;
  }
  if (hasPendingApproval(request.origin, CONNECT_METHOD)) {
    replyError(
      sendResponse,
      ErrorCode.REQUEST_PENDING,
      "A connection request from this site is already pending. Check the CointMU window.",
    );
    return;
  }
  await enqueueApproval({ ...request, request: null, sendResponse });
}

async function handleStandaloneSigning(request, state, sendResponse) {
  if (!isOriginConnected(await getConnectedOrigins(), request.origin)) {
    replyError(
      sendResponse,
      ErrorCode.UNAUTHORIZED,
      "Connect this site to CointMU first (eth_requestAccounts).",
    );
    return;
  }
  const context = signingContext(state);
  const parsed = parseSigningRequest(request.method, request.params, context);
  if (!parsed.ok) {
    replyError(sendResponse, parsed.error.code, parsed.error.message);
    return;
  }
  await enqueueApproval({
    ...request,
    request: parsed.request,
    chainId: context.chainId,
    sendResponse,
  });
}

async function routeContentRequest(request, sendResponse) {
  const state = await chrome.storage.local.get(STATE_KEYS);
  const isStandalone = state.connectionMode === STANDALONE_MODE;

  if (request.method === CONNECT_METHOD) {
    await handleConnect(request, state, sendResponse);
  } else if (isSigningMethod(request.method)) {
    if (isStandalone) {
      await handleStandaloneSigning(request, state, sendResponse);
    } else {
      replyError(
        sendResponse,
        ErrorCode.UNSUPPORTED_METHOD,
        DESKTOP_SIGNING_MESSAGE,
      );
    }
  } else if (isStandalone) {
    await forwardToCustomRpc(request, state, sendResponse);
  } else {
    forwardToDesktop(request, sendResponse);
  }
}

/**
 * Receives a JSON-RPC request relayed by the content script. The origin comes
 * from the browser (sender), never from the message body.
 * @param {{ id: number, method: string, params?: unknown[] }} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {Function} sendResponse
 * @returns {boolean} True to keep the channel open for the async reply.
 */
export function handleContentMessage(message, sender, sendResponse) {
  const context = readSender(sender);
  if (!context) {
    replyError(
      sendResponse,
      ErrorCode.UNAUTHORIZED,
      "Sender has no tab context.",
    );
    return false;
  }
  if (context.frameId !== TOP_FRAME_ID) {
    replyError(
      sendResponse,
      ErrorCode.UNAUTHORIZED,
      "Requests from embedded frames are not supported.",
    );
    return false;
  }
  if (typeof message.method !== "string") {
    replyError(sendResponse, ErrorCode.INVALID_PARAMS, "Missing method.");
    return false;
  }

  const request = {
    ...context,
    requestId: message.id,
    method: message.method,
    params: Array.isArray(message.params) ? message.params : [],
  };
  routeContentRequest(request, sendResponse).catch((err) => {
    replyError(
      sendResponse,
      ErrorCode.INTERNAL_ERROR,
      err?.message || "CointMU extension error.",
    );
  });
  return true;
}

/**
 * Answers the approval popup's request for what to display.
 * @param {{ reqId: string }} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {Function} sendResponse
 * @returns {boolean} False; the reply is synchronous.
 */
export function handlePendingRequestQuery(message, sender, sendResponse) {
  const entry = isFromApprovalPopup(sender)
    ? peekApproval(String(message.reqId))
    : null;
  sendResponse(
    entry
      ? { success: true, view: buildApprovalView(entry) }
      : { success: false },
  );
  return false;
}

async function signWithStandaloneWallet(entry) {
  const state = await chrome.storage.local.get(STATE_KEYS);
  const context = signingContext(state);
  // The user may switch account or network while the popup is open.
  if (
    !isSameAddress(entry.request.address, context.activeAddress) ||
    context.chainId !== entry.chainId
  ) {
    throw new Error("The active account or network changed; please retry.");
  }
  const wallet = (state.wallets || []).find((w) =>
    isSameAddress(w.address, context.activeAddress),
  );
  if (!wallet?.privateKey) {
    throw new Error("Private key not found for the active account.");
  }
  return executeSigning(entry.request, {
    privateKey: wallet.privateKey,
    network: activeNetwork(state),
  });
}

async function executeApproved(entry) {
  if (entry.request === null) {
    await addConnectedOrigin(entry.origin);
    const state = await chrome.storage.local.get(STATE_KEYS);
    if (state.connectionMode === STANDALONE_MODE) {
      replyResult(entry.sendResponse, [state.activeStandaloneAddress]);
    } else {
      forwardToDesktop({ ...entry, params: [] }, entry.sendResponse);
    }
    return;
  }
  replyResult(entry.sendResponse, await signWithStandaloneWallet(entry));
}

/**
 * Applies the user's answer from the approval popup. Each request can be
 * resolved once; a second answer finds nothing.
 * @param {{ reqId: string, approved: boolean }} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {Function} sendResponse
 * @returns {boolean} False; the popup gets its reply synchronously.
 */
export function handleApprovalResolution(message, sender, sendResponse) {
  const entry = isFromApprovalPopup(sender)
    ? takeApproval(String(message.reqId))
    : null;
  if (!entry) {
    sendResponse({ success: false, error: "Request not found." });
    return false;
  }
  sendResponse({ success: true });

  if (message.approved !== true) {
    replyError(
      entry.sendResponse,
      ErrorCode.USER_REJECTED,
      "User rejected the request.",
    );
    return false;
  }
  executeApproved(entry).catch((err) => {
    replyError(
      entry.sendResponse,
      ErrorCode.INTERNAL_ERROR,
      err?.message || "Signing failed.",
    );
  });
  return false;
}
