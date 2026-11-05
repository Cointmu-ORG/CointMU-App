import { callGethRpc, safeParseHex } from "./rpcUtils";

const STATUS_RPC_TIMEOUT_MS = 2_000;
const PERCENT = 100;

/** A short summary of the running node, for the tray and the quit check. */
export interface NodeStatus {
  /** False when the node did not answer. */
  readonly isOnline: boolean;
  /** Sync progress 0-100, or null when the node is not syncing. */
  readonly syncPercent: number | null;
  readonly isMining: boolean;
  /** Null when unknown. */
  readonly peers: number | null;
}

/**
 * Converts the node's eth_syncing answer to a percentage.
 * @param syncing - false, or geth's progress object (hex block numbers).
 * @returns 0-100 while syncing, null when synced or unknown.
 */
export function syncPercentOf(syncing: unknown): number | null {
  if (typeof syncing !== "object" || syncing === null) return null;
  const { currentBlock, highestBlock } = syncing as Record<string, unknown>;
  const current = safeParseHex(currentBlock as string);
  const highest = safeParseHex(highestBlock as string);
  if (highest <= 0) return null;
  return Math.min(PERCENT, (current / highest) * PERCENT);
}

/**
 * Reads sync, mining and peer state from the node, each call bounded.
 * @param rpcPort - The node's RPC port.
 * @returns The status; isOnline is false when eth_syncing got no answer.
 */
export async function readNodeStatus(rpcPort: number): Promise<NodeStatus> {
  const [syncing, mining, peers] = await Promise.all([
    callGethRpc(rpcPort, "eth_syncing", [], STATUS_RPC_TIMEOUT_MS),
    callGethRpc(rpcPort, "eth_mining", [], STATUS_RPC_TIMEOUT_MS),
    callGethRpc(rpcPort, "net_peerCount", [], STATUS_RPC_TIMEOUT_MS),
  ]);
  return {
    isOnline: syncing !== null,
    syncPercent: syncPercentOf(syncing),
    isMining: mining === true,
    peers: typeof peers === "string" ? safeParseHex(peers) : null,
  };
}
