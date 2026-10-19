const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

/**
 * Dispatches a JSON-RPC 2.0 call to the locally running Core-geth HTTP endpoint.
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
  try {
    const response = await fetch(`http://127.0.0.1:${rpcPort}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
      signal:
        timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
    });
    const json = await response.json();
    if (json.error) {
      console.warn(`[geth:rpc] ${method} error:`, json.error.message);
      return null;
    }
    return json.result;
  } catch (err) {
    console.warn(`[geth:rpc] ${method} unreachable:`, (err as Error).message);
    return null;
  }
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

/**
 * Formats a Unix timestamp in seconds into a human-readable relative age string
 * using second, minute, hour, and day granularities.
 * @param {number} timestamp - The Unix timestamp in seconds.
 * @returns {string} A relative age string such as '5s ago', '3m ago', '2h ago', or '1d ago'.
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < SECONDS_PER_MINUTE) return `${Math.max(1, diff)}s ago`;
  if (diff < SECONDS_PER_HOUR)
    return `${Math.floor(diff / SECONDS_PER_MINUTE)}m ago`;
  if (diff < SECONDS_PER_DAY)
    return `${Math.floor(diff / SECONDS_PER_HOUR)}h ago`;
  return `${Math.floor(diff / SECONDS_PER_DAY)}d ago`;
}
