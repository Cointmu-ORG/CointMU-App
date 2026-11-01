import type { JsonRpcEnvelope } from "../../../bridge/types";
import { isPrivilegedNodeMethod } from "../../security/rpcMethodPolicy";
import { callGethIpc, internalErrorEnvelope } from "./gethIpcClient";

const GETH_IPC_DEFAULT_TIMEOUT_MS = 10_000;

let gethIpcPath: string | null = null;

/**
 * Sets the geth --ipcpath endpoint used for admin and miner methods, which the
 * HTTP endpoint no longer serves.
 * @param path - The IPC endpoint, or null when geth is not running.
 */
export function configureGethIpcPath(path: string | null): void {
  gethIpcPath = path;
}

async function callGethHttp(
  rpcPort: number,
  method: string,
  params: unknown[],
  timeoutMs?: number,
): Promise<JsonRpcEnvelope> {
  try {
    const response = await fetch(`http://127.0.0.1:${rpcPort}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
      signal:
        timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
    });
    const json = await response.json();
    return json.error ? { error: json.error } : { result: json.result ?? null };
  } catch (err) {
    return internalErrorEnvelope(
      `geth HTTP unreachable: ${(err as Error).message}`,
    );
  }
}

/**
 * Dispatches a JSON-RPC 2.0 call to the local node and keeps the node's error
 * object. admin_* and miner_* go over the private IPC socket; everything else
 * goes to the HTTP endpoint.
 * @param rpcPort - The resolved RPC port of the running Geth node.
 * @param method - The JSON-RPC method name.
 * @param params - The ordered parameter array for the method.
 * @param timeoutMs - Optional deadline.
 * @returns The result or error envelope; never rejects.
 */
export async function callGethRpcRaw(
  rpcPort: number,
  method: string,
  params: unknown[] = [],
  timeoutMs?: number,
): Promise<JsonRpcEnvelope> {
  if (!isPrivilegedNodeMethod(method)) {
    return callGethHttp(rpcPort, method, params, timeoutMs);
  }
  if (gethIpcPath === null) {
    return internalErrorEnvelope("geth IPC endpoint is not configured");
  }
  return callGethIpc(
    gethIpcPath,
    method,
    params,
    timeoutMs ?? GETH_IPC_DEFAULT_TIMEOUT_MS,
  );
}

/**
 * Dispatches a JSON-RPC 2.0 call to the locally running Core-geth node.
 * Returns null on any network or RPC-level failure so callers can treat null as
 * the offline sentinel without wrapping every call in a try/catch.
 * @param {number} rpcPort - The resolved RPC port of the running Geth node.
 * @param {string} method - The JSON-RPC method name.
 * @param {unknown[]} params - The ordered parameter array for the method.
 * @param {number} [timeoutMs] - Optional deadline; an elapsed timeout yields null.
 * @returns {Promise<any>} The raw result from the RPC response, or null on failure.
 */
export async function callGethRpc(
  rpcPort: number,
  method: string,
  params: unknown[] = [],
  timeoutMs?: number,
): Promise<any> {
  const envelope = await callGethRpcRaw(rpcPort, method, params, timeoutMs);
  if ("error" in envelope) {
    console.warn(`[geth:rpc] ${method} error:`, envelope.error.message);
    return null;
  }
  return envelope.result;
}

/**
 * Converts a non-negative integer to a strictly formatted 0x-prefixed hexadecimal string.
 * @param {number} num - The integer to convert.
 * @returns {string} The hex string representation.
 */
export function toHex(num: number): string {
  return "0x" + Math.max(0, Math.floor(num)).toString(16);
}

/**
 * Safely parses a hex string to a number, returning 0 on any failure.
 * @param {string | undefined | null} val - The hex string to parse.
 * @returns {number} The parsed integer, or 0 when the value is missing or unparseable.
 */
export function safeParseHex(val: string | undefined | null): number {
  if (!val || typeof val !== "string") return 0;
  const parsed = parseInt(val, 16);
  return isNaN(parsed) ? 0 : parsed;
}
