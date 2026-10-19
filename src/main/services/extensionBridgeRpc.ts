import { BrowserWindow } from "electron";
import type { WebSocket } from "ws";
import type { JsonRpcEnvelope } from "../../bridge/types";
import {
  isBridgeRpcAllowed,
  isSigningMethod,
} from "../security/rpcMethodPolicy";
import { callGethRpcRaw } from "../utils/rpcUtils";

const JSON_RPC_VERSION = "2.0";
const JSON_RPC_INVALID_REQUEST = -32600;
const EIP1193_UNSUPPORTED_METHOD = 4200;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ACCOUNT_METHODS: ReadonlySet<string> = new Set([
  "eth_requestAccounts",
  "eth_accounts",
]);

export interface BridgeRpcRequest {
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
  readonly origin?: unknown;
  readonly __tabId?: unknown;
}

/**
 * Sends a JSON-RPC response back to the extension, echoing the routing fields.
 * @param socket - The extension socket.
 * @param request - The request being answered.
 * @param envelope - The result or error.
 */
export function sendBridgeRpcResponse(
  socket: WebSocket,
  request: BridgeRpcRequest,
  envelope: JsonRpcEnvelope,
): void {
  socket.send(
    JSON.stringify({
      jsonrpc: JSON_RPC_VERSION,
      id: request.id,
      __tabId: request.__tabId,
      ...envelope,
    }),
  );
}

/**
 * Decides whether the bridge refuses a method, with a message the dApp shows.
 * @param method - The requested method.
 * @returns An EIP-1193 4200 error envelope, or null when the method is allowed.
 */
export function rejectBridgeRpcMethod(method: string): JsonRpcEnvelope | null {
  if (ACCOUNT_METHODS.has(method) || isBridgeRpcAllowed(method)) return null;
  const message = isSigningMethod(method)
    ? `${method} is not supported in desktop mode yet: the CointMU desktop wallet cannot sign dApp requests. Switch the CointMU extension to standalone mode to sign.`
    : `${method} is not available through the CointMU desktop bridge.`;
  return { error: { code: EIP1193_UNSUPPORTED_METHOD, message } };
}

interface ActiveAddressStore {
  get(key: string): unknown;
}

/**
 * @param store - The electron-store instance.
 * @returns The active wallet address, or the zero address.
 */
function readActiveAddress(store: ActiveAddressStore): string {
  try {
    const address = store.get("activeWalletAddress");
    return typeof address === "string" && address !== ""
      ? address
      : ZERO_ADDRESS;
  } catch (err) {
    console.error(
      "[WS Server Error] Failed to fetch activeWalletAddress:",
      err,
    );
    return ZERO_ADDRESS;
  }
}

/**
 * Answers one JSON-RPC request from the paired extension: account methods
 * from the store, allowed read methods from the node, everything else with a
 * 4200 error.
 * @param socket - The paired extension socket.
 * @param request - The parsed request.
 * @param store - The electron-store instance.
 * @param rpcPort - The geth HTTP port.
 */
export async function handleBridgeRpc(
  socket: WebSocket,
  request: BridgeRpcRequest,
  store: ActiveAddressStore,
  rpcPort: number,
): Promise<void> {
  const { method } = request;
  if (typeof method !== "string") {
    sendBridgeRpcResponse(socket, request, {
      error: { code: JSON_RPC_INVALID_REQUEST, message: "Missing method" },
    });
    return;
  }

  const rejection = rejectBridgeRpcMethod(method);
  if (rejection) {
    sendBridgeRpcResponse(socket, request, rejection);
    return;
  }

  if (ACCOUNT_METHODS.has(method)) {
    if (method === "eth_requestAccounts") {
      BrowserWindow.getAllWindows()[0]?.webContents.send(
        "dapp:siteConnected",
        request.origin,
      );
    }
    sendBridgeRpcResponse(socket, request, {
      result: [readActiveAddress(store)],
    });
    return;
  }

  const params = Array.isArray(request.params) ? request.params : [];
  const envelope = await callGethRpcRaw(rpcPort, method, params);
  sendBridgeRpcResponse(socket, request, envelope);
}
