"use strict";

import {
  handleSocketMessage,
  setConnectionMode,
  connectionMode,
  pendingCallbacks,
} from "./wallet.js";

export const WS_URL = "ws://127.0.0.1:8765";
export const RECONNECT_DELAY_MS = 3000;

/** @type {WebSocket | null} */
export let socket = null;

/** @type {boolean} */
export let intentionalClose = false;

let pingInterval = null;
let pongTimeout = null;

export function clearHeartbeat() {
  if (pingInterval) clearInterval(pingInterval);
  if (pongTimeout) clearTimeout(pongTimeout);
  pingInterval = null;
  pongTimeout = null;
}

export function startHeartbeat() {
  clearHeartbeat();
  pingInterval = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ping" }));
      pongTimeout = setTimeout(() => {
        console.warn("[CointMU-bg] Heartbeat timeout, closing socket...");
        chrome.storage.local.set({ isLinked: false });
        if (socket) socket.close();
      }, 5000);
    }
  }, 30000);
}

/**
 * Opens the WebSocket connection to the CointMU Electron application and
 * registers event handlers. If the socket closes unexpectedly a reconnect
 * attempt is scheduled after RECONNECT_DELAY_MS milliseconds.
 * @returns {void}
 */
export function connect() {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  intentionalClose = false;
  socket = new WebSocket(WS_URL);

  socket.addEventListener("open", function () {
    console.log("[CointMU-bg] WebSocket connected to Electron.");
    chrome.storage.local.set({ isReconnecting: false });
    if (connectionMode === "desktop") {
      startHeartbeat();
    }
  });

  socket.addEventListener("message", handleSocketMessage);

  socket.addEventListener("close", function () {
    clearHeartbeat();
    chrome.storage.local.set({ isReconnecting: true });
    socket = null;

    pendingCallbacks.forEach(function (callback) {
      callback({
        result: null,
        error: { message: "CointMU desktop wallet disconnected." },
      });
    });
    pendingCallbacks.clear();

    if (!intentionalClose) {
      setTimeout(connect, RECONNECT_DELAY_MS);
    }
  });

  socket.addEventListener("error", function (err) {
    console.error("[CointMU-bg] WebSocket error:", err);
  });
}

/**
 * Closes the WebSocket connection cleanly, preventing the automatic reconnect
 * logic from triggering.
 * @returns {void}
 */
export function disconnect() {
  intentionalClose = true;
  if (socket) {
    socket.close();
    socket = null;
  }
}
