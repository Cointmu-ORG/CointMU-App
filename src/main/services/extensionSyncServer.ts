import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { callGethRpc } from "../utils/rpcUtils";
import { COINTMU_NETWORK } from "../../bridge/network";
import { ipcMain, BrowserWindow } from "electron";
import {
  BRIDGE_NOT_PAIRED_MESSAGE,
  BridgeAccess,
} from "../security/bridgeOrigin";
import {
  clearPairedOrigin,
  createPairedOriginCheck,
  savePairedOrigin,
  verifyExtensionClient,
} from "./extensionPairing";
import {
  handleBridgeRpc,
  sendBridgeRpcResponse,
  type BridgeRpcRequest,
} from "./extensionBridgeRpc";

const EXTENSION_SYNC_PORT = process.env.ELECTRON_WS_PORT
  ? parseInt(process.env.ELECTRON_WS_PORT)
  : 8765;
const EIP1193_UNAUTHORIZED = 4100;
/** Message types an extension may send before it is paired. */
const UNPAIRED_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "REQUEST_LINK",
  "ping",
]);
let wss: WebSocketServer | null = null;
let pendingSocket: WebSocket | null = null;
/** Sockets from the paired extension origin; only these get wallet data. */
const pairedSockets = new Set<WebSocket>();
const socketOrigins = new WeakMap<WebSocket, string>();

/**
 * Sends a payload to every open socket of the paired extension.
 * @param {string} payload - The serialized message.
 * @returns {void}
 */
function broadcastToPaired(payload: string): void {
  pairedSockets.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

/**
 * Tells an unpaired extension why it was refused. FORCE_UNLINK makes older
 * extension builds drop their stale "linked" state and show the pair screen.
 * @param {WebSocket} socket - The unpaired socket.
 * @param {BridgeRpcRequest & { jsonrpc?: unknown }} msg - The refused message.
 * @returns {void}
 */
function respondNotPaired(
  socket: WebSocket,
  msg: BridgeRpcRequest & { jsonrpc?: unknown },
): void {
  if (msg.jsonrpc === "2.0") {
    sendBridgeRpcResponse(socket, msg, {
      error: { code: EIP1193_UNAUTHORIZED, message: BRIDGE_NOT_PAIRED_MESSAGE },
    });
    return;
  }
  socket.send(
    JSON.stringify({
      type: "BRIDGE_ERROR",
      code: "NOT_PAIRED",
      message: BRIDGE_NOT_PAIRED_MESSAGE,
    }),
  );
  socket.send(JSON.stringify({ type: "FORCE_UNLINK" }));
}

/**
 * Notifies the renderer whether a paired extension is connected.
 * @param {boolean} isConnected - The new status.
 * @returns {void}
 */
function sendExtensionStatus(isConnected: boolean): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(
    "dapp:extensionStatus",
    isConnected,
  );
}

/**
 * Fetches the latest balance for the active wallet and broadcasts the full
 * state payload to all connected extension UI clients.
 * @param {any} store - The electron-store instance containing wallet settings.
 * @param {number} rpcPort - The current local Geth RPC port.
 * @returns {Promise<void>}
 */
export async function broadcastWalletState(
  store: any,
  rpcPort: number,
): Promise<void> {
  if (!wss) return;

  const address = store.get("activeWalletAddress");
  const network = COINTMU_NETWORK.name;
  let balance = "0.00";

  let accounts: string[] = [];

  if (address) {
    try {
      const balanceHex = await callGethRpc(rpcPort, "eth_getBalance", [
        address,
        "latest",
      ]);
      if (typeof balanceHex === "string" && balanceHex.startsWith("0x")) {
        const wei = BigInt(balanceHex);
        const eth = Number(wei) / 1e18;
        balance = eth.toFixed(4);
      }
    } catch (err) {
      console.error("[extension-sync] Failed to fetch balance:", err);
    }
  }

  try {
    const storedAccounts = store.get("accounts") || [];
    accounts = storedAccounts
      .filter((a: any) => !a.isHidden)
      .map((a: any) => a.address);
  } catch (err) {
    console.error("[extension-sync] Failed to fetch accounts from store:", err);
  }

  const payload = JSON.stringify({
    type: "WALLET_STATE",
    address,
    accounts,
    balance,
    network,
  });

  broadcastToPaired(payload);
}

/**
 * Initializes the WebSocket server dedicated to syncing wallet state down to
 * the companion browser extension popup UI.
 * @param {any} store - The electron-store instance.
 * @param {number} rpcPort - The current local Geth RPC port.
 * @param {BrowserWindow} win - The main electron window for IPC.
 * @returns {{ close: () => void }} An object containing the close method for cleanup.
 */
export function startExtensionSyncServer(
  store: any,
  rpcPort: number,
  win: BrowserWindow,
): { close: () => void } {
  wss = new WebSocketServer({
    host: "127.0.0.1",
    port: EXTENSION_SYNC_PORT,
    verifyClient: verifyExtensionClient,
  });
  const checkPairing = createPairedOriginCheck(store);

  ipcMain.on("pairing:respond", (_, approved: boolean) => {
    if (pendingSocket && pendingSocket.readyState === 1) {
      const origin = socketOrigins.get(pendingSocket);
      if (approved && origin) {
        savePairedOrigin(store, origin);
        pairedSockets.clear();
        pairedSockets.add(pendingSocket);
        pendingSocket.send(JSON.stringify({ type: "LINK_APPROVED" }));
        store.set("isExtensionLinked", true);
        win.webContents.send("extension:linked");
        sendExtensionStatus(true);
        void broadcastWalletState(store, rpcPort);
      } else {
        pendingSocket.send(JSON.stringify({ type: "LINK_REJECTED" }));
      }
    }
    pendingSocket = null;
  });

  ipcMain.on("extension:unlink", () => {
    broadcastToPaired(JSON.stringify({ type: "FORCE_UNLINK" }));
    pairedSockets.clear();
    clearPairedOrigin(store);
    store.set("isExtensionLinked", false);
    sendExtensionStatus(false);
  });

  ipcMain.on("dapp:revokeSite", (_, origin: string) => {
    broadcastToPaired(JSON.stringify({ type: "REVOKE_SITE", origin }));
  });

  wss.on("listening", () => {
    console.log(`[Extension-Bridge] Listening on port ${EXTENSION_SYNC_PORT}`);
  });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    const origin = req.headers.origin;
    if (origin) socketOrigins.set(socket, origin);
    const isPaired = checkPairing(origin) === BridgeAccess.PAIRED;
    console.log(
      `[extension-sync] Extension connected (${isPaired ? "paired" : "not paired"}).`,
    );
    if (isPaired) {
      pairedSockets.add(socket);
      sendExtensionStatus(true);
    }

    socket.on("message", async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (
          !pairedSockets.has(socket) &&
          !UNPAIRED_MESSAGE_TYPES.has(msg.type)
        ) {
          respondNotPaired(socket, msg);
        } else if (msg.type === "REQUEST_LINK") {
          pendingSocket = socket;
          win.webContents.send("pairing:request");
        } else if (msg.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
        } else if (msg.type === "AUTO_RECONNECT") {
          void broadcastWalletState(store, rpcPort);
        } else if (msg.type === "GET_ACCOUNTS") {
          let accounts: string[] = [];
          try {
            const storedAccounts = store.get("accounts") || [];
            accounts = storedAccounts
              .filter((a: any) => !a.isHidden)
              .map((a: any) => a.address);
          } catch (err) {
            console.error(
              "[extension-sync] Failed to fetch accounts from store:",
              err,
            );
          }
          const activeAccount =
            store.get("activeWalletAddress") || accounts[0] || "";
          socket.send(
            JSON.stringify({ type: "ACCOUNTS_LIST", accounts, activeAccount }),
          );
        } else if (msg.type === "SWITCH_ACCOUNT") {
          store.set("activeWalletAddress", msg.address);
          void broadcastWalletState(store, rpcPort);
          broadcastToPaired(
            JSON.stringify({
              type: "ACCOUNTS_CHANGED",
              accounts: [msg.address],
            }),
          );
        } else if (msg.jsonrpc === "2.0") {
          try {
            await handleBridgeRpc(socket, msg, store, rpcPort);
          } catch (error) {
            console.error("[WS Server Error]:", error);
          }
        }
      } catch (err) {
        console.error("[extension-sync] Failed to parse message:", err);
      }
    });

    socket.on("close", () => {
      console.log("[extension-sync] Extension UI disconnected.");
      if (pendingSocket === socket) {
        pendingSocket = null;
      }
      pairedSockets.delete(socket);
      if (pairedSockets.size === 0) {
        sendExtensionStatus(false);
      }
    });

    socket.on("error", (err: Error) => {
      console.error("[extension-sync] Socket error:", err.message);
      pairedSockets.delete(socket);
      if (pairedSockets.size === 0) {
        sendExtensionStatus(false);
      }
    });
  });

  wss.on("error", (err: Error) => {
    console.error("[extension-sync] Server error:", err.message);
  });

  return {
    close(): void {
      if (wss) {
        wss.close();
        wss = null;
      }
      pairedSockets.clear();
      ipcMain.removeAllListeners("pairing:respond");
      ipcMain.removeAllListeners("extension:unlink");
      ipcMain.removeAllListeners("dapp:revokeSite");
    },
  };
}
