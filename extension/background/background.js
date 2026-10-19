"use strict";

import "../lib/ethers.umd.min.js";
import { handleInternalMessage, setConnectionMode } from "../shared/wallet.js";
import {
  handleApprovalResolution,
  handleContentMessage,
  handlePendingRequestQuery,
} from "../shared/dapp-requests.js";
import {
  handleTabRemoved,
  handleWindowRemoved,
} from "../shared/dapp-approvals.js";
import { connect } from "../shared/socket.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "GET_PENDING_REQ") {
    return handlePendingRequestQuery(message, sender, sendResponse);
  }
  if (message.action === "RESOLVE_REQ") {
    return handleApprovalResolution(message, sender, sendResponse);
  }
  if (message.action) {
    return handleInternalMessage(message, sender, sendResponse);
  }
  return handleContentMessage(message, sender, sendResponse);
});

chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.windows.onRemoved.addListener(handleWindowRemoved);

chrome.storage.local.get(["isLinked", "connectionMode"]).then((res) => {
  setConnectionMode(res.connectionMode || "desktop");
  if (res.isLinked && res.connectionMode === "desktop") {
    connect();
  }
});
