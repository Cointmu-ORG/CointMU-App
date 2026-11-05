"use strict";

import "../lib/ethers.umd.min.js";
import { setConnectionMode } from "../shared/wallet.js";
import { handleRuntimeMessage } from "../shared/runtime-router.js";
import {
  handleTabRemoved,
  handleWindowRemoved,
} from "../shared/dapp-approvals.js";
import { connect } from "../shared/socket.js";
import { handleAutoLockAlarm } from "../shared/wallet-vault.js";

// No onMessageExternal/onConnectExternal listener and no externally_connectable:
// other extensions and web pages cannot message the background directly.
chrome.runtime.onMessage.addListener(handleRuntimeMessage);

chrome.alarms.onAlarm.addListener((alarm) => {
  handleAutoLockAlarm(alarm).catch((err) => {
    console.error("[CointMU-bg] Auto-lock failed:", err);
  });
});
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.windows.onRemoved.addListener(handleWindowRemoved);

chrome.storage.local.get(["isLinked", "connectionMode"]).then((res) => {
  setConnectionMode(res.connectionMode || "desktop");
  if (res.isLinked && res.connectionMode === "desktop") {
    connect();
  }
});
