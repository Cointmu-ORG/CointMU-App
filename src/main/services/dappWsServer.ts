import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket, type RawData } from "ws";
import { ipcMain, type BrowserWindow } from "electron";
import {
  BRIDGE_NOT_PAIRED_MESSAGE,
  BridgeAccess,
} from "../security/bridgeOrigin";
import { verifyExtensionClient } from "./extensionPairing";

const DAPP_WS_PORT = 8546;
const JSON_RPC_VERSION = "2.0";
const WS_CLOSE_POLICY_VIOLATION = 1008;
// Close reasons must fit in a 123-byte control frame.
const NOT_PAIRED_CLOSE_REASON = "Extension not paired";

/**
 * Represents a single JSON-RPC request received from the browser extension,
 * augmented with the tab context needed to route the response back.
 */
interface PendingDappRequest {
  id: number;
  method: string;
  params: unknown[];
  tabId: number;
  origin: string;
  socket: WebSocket;
}

/**
 * Holds all requests that have been forwarded to the renderer and are awaiting
 * user approval or rejection. Keyed by the composite tabId:requestId string.
 * @type {Map<string, PendingDappRequest>}
 */
const pendingRequests = new Map<string, PendingDappRequest>();

/**
 * Builds the composite pending-map key from a tab ID and request ID.
 * @param {number} tabId - The Chrome tab ID of the originating content script.
 * @param {number} requestId - The JSON-RPC request ID from the injected provider.
 * @returns {string} The composite key string.
 */
function pendingKey(tabId: number, requestId: number): string {
  return `${tabId}:${requestId}`;
}

/**
 * Serialises a JSON-RPC 2.0 success response and sends it over the given WebSocket.
 * @param {WebSocket} socket - The WebSocket connection to the browser extension.
 * @param {number} id - The request ID to echo back in the response.
 * @param {number} tabId - The originating tab ID forwarded as __tabId.
 * @param {unknown} result - The result value to include in the response.
 * @returns {void}
 */
function sendResult(
  socket: WebSocket,
  id: number,
  tabId: number,
  result: unknown,
): void {
  socket.send(
    JSON.stringify({ jsonrpc: JSON_RPC_VERSION, id, result, __tabId: tabId }),
  );
}

/**
 * Serialises a JSON-RPC 2.0 error response and sends it over the given WebSocket.
 * @param {WebSocket} socket - The WebSocket connection to the browser extension.
 * @param {number} id - The request ID to echo back in the response.
 * @param {number} tabId - The originating tab ID forwarded as __tabId.
 * @param {number} code - The JSON-RPC error code.
 * @param {string} message - A human-readable description of the error.
 * @returns {void}
 */
function sendError(
  socket: WebSocket,
  id: number,
  tabId: number,
  code: number,
  message: string,
): void {
  socket.send(
    JSON.stringify({
      jsonrpc: JSON_RPC_VERSION,
      id,
      error: { code, message },
      __tabId: tabId,
    }),
  );
}

/**
 * Handles a raw WebSocket message from the browser extension. The payload is
 * expected to be a JSON-RPC 2.0 request augmented with a __tabId field. The
 * request is stored in the pending map and an IPC event is emitted to the
 * renderer so the approval UI can be displayed to the user.
 * @param {WebSocket} socket - The WebSocket connection from the extension.
 * @param {RawData} raw - The raw message data received over the socket.
 * @param {BrowserWindow} win - The main Electron BrowserWindow for IPC dispatch.
 * @returns {void}
 */
function handleExtensionMessage(
  socket: WebSocket,
  raw: RawData,
  win: BrowserWindow,
): void {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw.toString()) as Record<string, unknown>;
  } catch {
    console.error("[dapp-ws] Received malformed JSON from extension");
    return;
  }

  const id = payload.id as number;
  const method = payload.method as string;
  const params = (payload.params as unknown[]) || [];
  const tabId = payload.__tabId as number;
  const origin = (payload.origin as string) || `Tab ${tabId}`;

  if (
    typeof id !== "number" ||
    typeof method !== "string" ||
    typeof tabId !== "number"
  ) {
    console.warn(
      "[dapp-ws] Ignoring request with missing required fields:",
      payload,
    );
    return;
  }

  const key = pendingKey(tabId, id);
  pendingRequests.set(key, { id, method, params, tabId, origin, socket });

  win.webContents.send("dapp:request", { id, method, params, tabId, origin });
}

/**
 * Registers the IPC handler that the renderer calls after the user approves or
 * rejects a dApp request. On approval the result is forwarded to the extension
 * over the stored WebSocket. On rejection an EIP-1193 4001 error is returned.
 * @returns {void}
 */
function registerApprovalHandler(): void {
  ipcMain.on(
    "dapp:response",
    (
      _event,
      payload: {
        id: number;
        tabId: number;
        approved: boolean;
        result?: unknown;
      },
    ) => {
      const key = pendingKey(payload.tabId, payload.id);
      const request = pendingRequests.get(key);
      if (!request) {
        console.warn("[dapp-ws] Received response for unknown request:", key);
        return;
      }
      pendingRequests.delete(key);

      if (!payload.approved) {
        sendError(
          request.socket,
          request.id,
          request.tabId,
          4001,
          "User rejected the request.",
        );
        return;
      }

      sendResult(
        request.socket,
        request.id,
        request.tabId,
        payload.result ?? null,
      );
    },
  );
}

/**
 * Creates and starts the dApp WebSocket server on DAPP_WS_PORT. The server
 * accepts connections from the browser extension background script, parses
 * incoming JSON-RPC requests, and dispatches them to the renderer via IPC for
 * user approval. Returns a cleanup function that closes the server and removes
 * the IPC handler so the caller can shut down cleanly on app exit. Only the
 * paired extension may connect; anything else would reach the renderer with
 * a self-declared dApp origin.
 * @param {BrowserWindow} win - The main Electron BrowserWindow for IPC dispatch.
 * @param {(origin: string | undefined) => BridgeAccess} checkPairing - Classifies a handshake origin.
 * @returns {{ close: () => void }} An object with a close method for cleanup.
 */
function startDappWsServer(
  win: BrowserWindow,
  checkPairing: (origin: string | undefined) => BridgeAccess,
): { close: () => void } {
  const wss = new WebSocketServer({
    host: "127.0.0.1",
    port: DAPP_WS_PORT,
    verifyClient: verifyExtensionClient,
  });

  wss.on("listening", () => {
    console.log(`[dapp-ws] Listening on ws://127.0.0.1:${DAPP_WS_PORT}`);
  });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    if (checkPairing(req.headers.origin) !== BridgeAccess.PAIRED) {
      console.warn(`[dapp-ws] ${BRIDGE_NOT_PAIRED_MESSAGE}`);
      socket.close(WS_CLOSE_POLICY_VIOLATION, NOT_PAIRED_CLOSE_REASON);
      return;
    }
    console.log("[dapp-ws] Browser extension connected.");

    socket.on("message", (raw: RawData) => {
      handleExtensionMessage(socket, raw, win);
    });

    socket.on("close", () => {
      console.log("[dapp-ws] Browser extension disconnected.");
      pendingRequests.forEach((request, key) => {
        if (request.socket === socket) {
          sendError(
            socket,
            request.id,
            request.tabId,
            -32000,
            "Extension disconnected.",
          );
          pendingRequests.delete(key);
        }
      });
    });

    socket.on("error", (err: Error) => {
      console.error("[dapp-ws] Socket error:", err.message);
    });
  });

  wss.on("error", (err: Error) => {
    console.error("[dapp-ws] Server error:", err.message);
  });

  registerApprovalHandler();

  return {
    close(): void {
      ipcMain.removeAllListeners("dapp:response");
      pendingRequests.clear();
      wss.close();
    },
  };
}

export { startDappWsServer, DAPP_WS_PORT };
export type { PendingDappRequest };
