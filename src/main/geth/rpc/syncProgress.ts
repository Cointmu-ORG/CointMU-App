import type { SyncProgress } from "../recovery/syncStallWatchdog";
import { callGethRpc, safeParseHex } from "./rpcUtils";

const SYNC_RPC_TIMEOUT_MS = 5_000;

/** Parses a JSON-RPC quantity (or a decimal number) as a bigint; 0n when unusable. */
function toBigInt(value: unknown): bigint {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value !== "string" || value === "") return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

/**
 * Finds the highest total difficulty any peer reports (admin_peers,
 * protocols.eth.difficulty), which is how far ahead the network is when
 * eth_syncing already says false.
 * @param peers - The admin_peers answer.
 * @returns The highest difficulty, or 0n when none is reported.
 */
export function highestPeerDifficulty(peers: unknown): bigint {
  if (!Array.isArray(peers)) return 0n;
  let highest = 0n;
  for (const peer of peers) {
    const eth = (peer as { protocols?: { eth?: unknown } } | null)?.protocols
      ?.eth;
    const difficulty = toBigInt(
      (eth as { difficulty?: unknown } | null)?.difficulty,
    );
    if (difficulty > highest) highest = difficulty;
  }
  return highest;
}

/**
 * Turns the raw node answers into a SyncProgress.
 * @returns The progress, or null when the node gave no usable head.
 */
export function toSyncProgress(answers: {
  readonly syncing: unknown;
  readonly blockNumber: unknown;
  readonly peers: unknown;
  readonly latestBlock: unknown;
}): SyncProgress | null {
  if (typeof answers.blockNumber !== "string" || !Array.isArray(answers.peers))
    return null;
  const localBlock = safeParseHex(answers.blockNumber);
  const syncing = answers.syncing as { highestBlock?: string } | null;
  const isSyncingBehind =
    typeof syncing === "object" &&
    syncing !== null &&
    safeParseHex(syncing.highestBlock) > localBlock;
  const localTd = toBigInt(
    (answers.latestBlock as { totalDifficulty?: unknown } | null)
      ?.totalDifficulty,
  );
  return {
    localBlock,
    isBehind: isSyncingBehind || highestPeerDifficulty(answers.peers) > localTd,
    peers: answers.peers.length,
  };
}

/**
 * Reads the head, sync state, peers and local total difficulty, each bounded.
 * @param rpcPort - The node's RPC port (the IPC endpoint is used when set).
 * @returns The progress, or null when geth did not answer.
 */
export async function readSyncProgress(
  rpcPort: number,
): Promise<SyncProgress | null> {
  const call = (method: string, params: unknown[] = []): Promise<unknown> =>
    callGethRpc(rpcPort, method, params, SYNC_RPC_TIMEOUT_MS);
  const [syncing, blockNumber, peers, latestBlock] = await Promise.all([
    call("eth_syncing"),
    call("eth_blockNumber"),
    call("admin_peers"),
    call("eth_getBlockByNumber", ["latest", false]),
  ]);
  return toSyncProgress({ syncing, blockNumber, peers, latestBlock });
}
