"use strict";

import {
  socket,
  connect,
  disconnect,
  clearHeartbeat,
  startHeartbeat,
} from "./socket.js";
import { removeConnectedOrigin } from "./site-permissions.js";

export const JSON_RPC_VERSION = "2.0";

/** @type {'desktop' | 'standalone'} */
export let connectionMode = "desktop";

export function setConnectionMode(mode) {
  connectionMode = mode;
}

/**
 * Maps a composite key of tabId:requestId to the chrome.runtime response callback
 * so that when the WebSocket returns a result the correct sender can be resolved.
 * @type {Map<string, Function>}
 */
export const pendingCallbacks = new Map();

/**
 * Builds the composite pending-map key for a given tab and request ID.
 * @param {number} tabId - The Chrome tab ID of the originating content script.
 * @param {number} requestId - The JSON-RPC request ID assigned by the injected provider.
 * @returns {string} The composite key string.
 */
export function pendingKey(tabId, requestId) {
  return `${tabId}:${requestId}`;
}

/**
 * Handles a raw message received from the CointMU Electron WebSocket server.
 * Parses the JSON-RPC response and routes it to the pending callback for the
 * originating tab, then removes the callback from the map.
 * @param {MessageEvent} event - The WebSocket message event from the Electron server.
 * @returns {void}
 */
export function handleSocketMessage(event) {
  let payload;
  try {
    payload = JSON.parse(event.data);
  } catch {
    console.error(
      "[CointMU-bg] Received malformed JSON from WS server:",
      event.data,
    );
    return;
  }

  if (payload.type === "pong") {
    clearHeartbeat();
    if (connectionMode === "desktop") startHeartbeat();
    return;
  } else if (payload.type === "LINK_APPROVED") {
    connectionMode = "desktop";
    chrome.storage.local.set({ isLinked: true, connectionMode: "desktop" });
    chrome.storage.local.remove("bridgeNotice");
    return;
  } else if (payload.type === "LINK_REJECTED") {
    chrome.storage.local.set({ isLinked: false });
    return;
  } else if (payload.type === "FORCE_UNLINK") {
    chrome.storage.local.remove(["isLinked", "walletState"]);
    return;
  } else if (payload.type === "BRIDGE_ERROR") {
    // The desktop app refused this extension (e.g. not paired); the popup
    // shows the notice on the pairing screen until the next approved link.
    chrome.storage.local.set({ bridgeNotice: payload.code || "UNKNOWN" });
    return;
  } else if (payload.type === "WALLET_STATE") {
    if (connectionMode === "standalone") {
      chrome.storage.local.set({ isLinked: true, walletState: payload });
    } else {
      connectionMode = "desktop";
      chrome.storage.local.set({
        isLinked: true,
        connectionMode: "desktop",
        walletState: payload,
      });
    }
    return;
  } else if (payload.type === "ACCOUNTS_LIST") {
    chrome.runtime.sendMessage(payload).catch(() => {});
    return;
  } else if (payload.type === "REVOKE_SITE") {
    if (payload.origin) {
      removeConnectedOrigin(payload.origin).catch((err) => {
        console.error("[CointMU-bg] Failed to revoke site:", err);
      });
      chrome.tabs.query({ url: payload.origin + "/*" }, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs
              .sendMessage(tab.id, { type: "REVOKE_SITE" })
              .catch(() => {});
          }
        }
      });
    }
    return;
  } else if (payload.type === "ACCOUNTS_CHANGED") {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: "ACCOUNTS_CHANGED",
              accounts: payload.accounts,
            })
            .catch(() => {});
        }
      }
    });
    return;
  }

  const { __tabId, id, result, error } = payload;
  if (__tabId === undefined || id === undefined) return;

  const key = pendingKey(__tabId, id);
  const callback = pendingCallbacks.get(key);
  if (!callback) return;

  pendingCallbacks.delete(key);
  callback({ result: result ?? null, error: error ?? null });
}

/**
 * Handles internal extension messages from the popup UI.
 * @param {any} message - The message payload.
 * @param {chrome.runtime.MessageSender} sender - The sender.
 * @param {Function} sendResponse - The reply callback.
 * @returns {boolean}
 */
export function handleInternalMessage(message, sender, sendResponse) {
  if (message.action === "REQUEST_LINK") {
    const LINK_TIMEOUT_MS = 5000;

    const trySend = () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "REQUEST_LINK" }));
        sendResponse({ success: true });
      } else {
        sendResponse({
          success: false,
          error:
            "Could not reach CointMU Desktop App. Make sure it's running and try again.",
        });
      }
    };

    if (socket && socket.readyState === WebSocket.OPEN) {
      trySend();
    } else {
      connect();
      let settled = false;

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (socket) socket.removeEventListener("open", onOpen);
        trySend();
      }, LINK_TIMEOUT_MS);

      const onOpen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        trySend();
        if (socket) socket.removeEventListener("open", onOpen);
      };
      if (socket) socket.addEventListener("open", onOpen);
    }
    return true;
  }

  if (
    message.action === "AUTO_RECONNECT" ||
    message.action === "GET_ACCOUNTS"
  ) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: message.action }));
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "WebSocket not connected" });
    }
    return false;
  }

  if (message.action === "GET_CURRENT_STATE") {
    chrome.storage.local
      .get([
        "isLinked",
        "walletState",
        "connectionMode",
        "wallets",
        "customNetworks",
        "activeStandaloneAddress",
        "activeNetworkId",
        "bridgeNotice",
      ])
      .then((res) => {
        const isDesktopMode = (res.connectionMode || "desktop") === "desktop";
        const hasNoDesktopAccounts =
          !res.walletState ||
          !Array.isArray(res.walletState.accounts) ||
          res.walletState.accounts.length === 0;

        if (isDesktopMode && hasNoDesktopAccounts) {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "GET_ACCOUNTS" }));
          } else {
            connect();
            const onOpen = () => {
              if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "GET_ACCOUNTS" }));
              }
              if (socket) socket.removeEventListener("open", onOpen);
            };
            if (socket) socket.addEventListener("open", onOpen);
          }
        }

        sendResponse({
          isLinked: res.isLinked === true,
          isReconnecting: res.isReconnecting === true,
          walletState: res.walletState,
          connectionMode: res.connectionMode || "desktop",
          wallets: res.wallets || [],
          customNetworks: res.customNetworks || [],
          activeStandaloneAddress: res.activeStandaloneAddress || null,
          activeNetworkId: res.activeNetworkId || "desktop_connection",
          bridgeNotice: res.bridgeNotice || null,
        });
      });
    return true;
  }

  if (message.action === "IMPORT_PRIVATE_KEY") {
    try {
      const wallet = new globalThis.ethers.Wallet(message.privateKey);
      const address = wallet.address;

      chrome.storage.local.get(["wallets"], (res) => {
        let wallets = res.wallets || [];
        const exists = wallets.find((w) => w.address === address);
        if (!exists) {
          wallets.push({ privateKey: message.privateKey, address });
        }

        connectionMode = "standalone";

        chrome.storage.local
          .set({
            isLinked: true,
            connectionMode: "standalone",
            wallets: wallets,
            activeStandaloneAddress: address,
          })
          .then(() => {
            disconnect(); // Disconnect from desktop WS
            sendResponse({ success: true, address });
          })
          .catch((err) => {
            console.error("Failed to save to local storage", err);
            sendResponse({ success: false, error: "Storage save failed" });
          });
      });
    } catch (err) {
      console.error("Derivation error:", err);
      sendResponse({
        success: false,
        error: "Invalid private key or derivation failed",
      });
    }
    return true;
  }

  if (message.action === "ADD_CUSTOM_NETWORK") {
    chrome.storage.local.get(["customNetworks"], (res) => {
      let customNetworks = res.customNetworks || [];
      const newNetwork = {
        id: "custom_" + Date.now(),
        name: message.name,
        rpcUrl: message.rpcUrl,
        chainId: message.chainId,
      };
      customNetworks.push(newNetwork);
      chrome.storage.local
        .set({ customNetworks, activeNetworkId: newNetwork.id })
        .then(() => {
          sendResponse({ success: true, network: newNetwork });
        });
    });
    return true;
  }

  if (message.action === "SWITCH_NETWORK") {
    chrome.storage.local
      .set({ activeNetworkId: message.networkId })
      .then(() => {
        sendResponse({ success: true });
      });
    return true;
  }

  if (message.action === "DELETE_NETWORK") {
    chrome.storage.local.get(["customNetworks"]).then((res) => {
      let customNetworks = res.customNetworks || [];
      customNetworks = customNetworks.filter((n) => n.id !== message.networkId);
      chrome.storage.local.set({ customNetworks }).then(() => {
        sendResponse({ success: true });
        chrome.storage.local.get(null).then((allState) => {
          chrome.runtime
            .sendMessage({ action: "STATE_UPDATED", state: allState })
            .catch(() => {});
        });
      });
    });
    return true;
  }

  if (message.action === "SWITCH_ACCOUNT") {
    const address = message.address;
    const mode = message.mode;

    if (mode === "standalone") {
      connectionMode = "standalone";
      chrome.storage.local
        .set({ connectionMode: "standalone", activeStandaloneAddress: address })
        .then(() => {
          sendResponse({ success: true });
        });
      return true;
    } else if (mode === "desktop") {
      connectionMode = "desktop";
      chrome.storage.local.set({ connectionMode: "desktop" });
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: message.action, address: address }));
        sendResponse({ success: true });
      } else {
        connect();
        const onOpen = () => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({ type: message.action, address: address }),
            );
          }
          if (socket) socket.removeEventListener("open", onOpen);
        };
        if (socket) socket.addEventListener("open", onOpen);
        sendResponse({ success: true });
      }
      return false;
    }
    return false;
  }

  if (message.action === "DELETE_WALLET") {
    chrome.storage.local
      .get(["wallets", "activeStandaloneAddress", "connectionMode"])
      .then((res) => {
        let wallets = res.wallets || [];
        wallets = wallets.filter(
          (w) => w.address.toLowerCase() !== message.address.toLowerCase(),
        );

        const updates = { wallets };

        if (
          res.connectionMode === "standalone" &&
          res.activeStandaloneAddress &&
          res.activeStandaloneAddress.toLowerCase() ===
            message.address.toLowerCase()
        ) {
          if (wallets.length > 0) {
            updates.activeStandaloneAddress = wallets[0].address;
            handleInternalMessage(
              {
                action: "SWITCH_ACCOUNT",
                address: wallets[0].address,
                mode: "standalone",
              },
              sender,
              () => {},
            );
          } else {
            updates.activeStandaloneAddress = null;
            // updates.walletState = null;
          }
        }

        chrome.storage.local.set(updates).then(() => {
          sendResponse({ success: true });
          chrome.storage.local.get(null).then((allState) => {
            chrome.runtime
              .sendMessage({ action: "STATE_UPDATED", state: allState })
              .catch(() => {});
          });
        });
      });
    return true;
  }

  if (message.action === "EXECUTE_SEND") {
    if (message.mode === "standalone") {
      chrome.storage.local
        .get(["wallets", "activeStandaloneAddress", "customNetworks"])
        .then((res) => {
          const addr = res.activeStandaloneAddress;
          if (!addr) {
            sendResponse({
              success: false,
              error: "No active standalone address",
            });
            return;
          }
          const walletData = (res.wallets || []).find(
            (w) => w.address === addr,
          );
          if (!walletData || !walletData.privateKey) {
            sendResponse({ success: false, error: "Private key not found" });
            return;
          }
          const customNet = (res.customNetworks || []).find(
            (n) => n.id === message.networkId,
          );
          if (!customNet) {
            sendResponse({ success: false, error: "Custom network not found" });
            return;
          }
          let rpcUrl = customNet.rpcUrl;
          if (!rpcUrl.startsWith("http")) rpcUrl = "http://" + rpcUrl;
          try {
            const provider = new globalThis.ethers.JsonRpcProvider(
              rpcUrl,
              parseInt(customNet.chainId, 10),
              { staticNetwork: true },
            );
            const signer = new globalThis.ethers.Wallet(
              walletData.privateKey,
              provider,
            );
            signer
              .sendTransaction({
                to: message.to,
                value: globalThis.ethers.parseEther(message.amount),
              })
              .then((tx) => {
                sendResponse({ success: true, hash: tx.hash });
              })
              .catch((err) => {
                console.error("Send error:", err);
                sendResponse({
                  success: false,
                  error: err.message || "Transaction failed",
                });
              });
          } catch (err) {
            sendResponse({
              success: false,
              error: err.message || "Failed to init provider",
            });
          }
        });
      return true;
    } else if (message.mode === "desktop") {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        sendResponse({ success: false, error: "Desktop wallet not connected" });
        return false;
      }
      const wsPayload = JSON.stringify({
        jsonrpc: JSON_RPC_VERSION,
        id: Date.now(),
        method: "eth_sendTransaction",
        params: [
          {
            from: message.from,
            to: message.to,
            value:
              "0x" + globalThis.ethers.parseEther(message.amount).toString(16),
          },
        ],
        __tabId: "extension",
        origin: "CointMU Extension",
      });
      socket.send(wsPayload);
      sendResponse({ success: true, pendingApproval: true });
      return false;
    }
  }

  return false;
}
