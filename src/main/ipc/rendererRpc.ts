import { ipcMain } from "electron";
import { RPC_CHANNELS } from "../../bridge/ipc-channels";
import type { JsonRpcEnvelope } from "../../bridge/types";
import { isRendererRpcAllowed } from "../security/rpcMethodPolicy";
import { callGethRpcRaw } from "../geth/rpc/rpcUtils";

const JSON_RPC_INVALID_PARAMS = -32602;
const JSON_RPC_METHOD_NOT_FOUND = -32601;

/**
 * Validates one renderer RPC request at the IPC boundary.
 * @param method - The requested method.
 * @param params - The requested parameters.
 * @returns An error envelope when the request is rejected, otherwise null.
 */
export function rejectRendererRpc(
  method: unknown,
  params: unknown,
): JsonRpcEnvelope | null {
  if (typeof method !== "string" || !Array.isArray(params)) {
    return {
      error: { code: JSON_RPC_INVALID_PARAMS, message: "Invalid RPC request" },
    };
  }
  if (!isRendererRpcAllowed(method)) {
    return {
      error: {
        code: JSON_RPC_METHOD_NOT_FOUND,
        message: `Method ${method} is not available to the app`,
      },
    };
  }
  return null;
}

/**
 * Relays renderer JSON-RPC calls to the node from the main process, so the
 * geth HTTP endpoint needs no CORS and web pages cannot read it. The handler
 * stays registered until the process exits: quitting waits for geth to stop
 * while the window keeps polling, and a call to a removed handler is logged
 * as an error. While geth is down the call answers with an error envelope.
 * @param getRpcPort - Returns the current geth HTTP port.
 */
export function registerRendererRpcHandler(getRpcPort: () => number): void {
  ipcMain.handle(
    RPC_CHANNELS.CALL,
    async (_event, method: unknown, params: unknown) => {
      const rejection = rejectRendererRpc(method, params);
      if (rejection) return rejection;
      return callGethRpcRaw(
        getRpcPort(),
        method as string,
        params as unknown[],
      );
    },
  );
}
