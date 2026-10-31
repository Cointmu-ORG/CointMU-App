import ms from "ms";
import type { IndexedBlock } from "./blockStore";

const RPC_TIMEOUT_MS = ms("10s");
const HEX_RADIX = 16;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const QUANTITY_PATTERN = /^0x[0-9a-f]+$/;
const GENESIS_TAG = "0x0";

/** The node's chain state at one moment. */
export interface ChainHead {
  readonly head: number;
  readonly genesisHash: string;
  readonly isSyncing: boolean;
}

/** Where the indexer reads blocks from. */
export interface BlockSource {
  chainHead(signal: AbortSignal): Promise<ChainHead>;
  /** @returns The canonical blocks at these heights, in the same order. */
  blocks(
    numbers: readonly number[],
    signal: AbortSignal,
  ): Promise<IndexedBlock[]>;
}

/** The node could not be reached or answered something unusable. */
export class BlockSourceError extends Error {
  override readonly name = "BlockSourceError";
}

interface RpcRequest {
  readonly method: string;
  readonly params: readonly unknown[];
}

const toQuantity = (n: number): string => "0x" + n.toString(HEX_RADIX);

function parseQuantity(value: unknown, field: string): number {
  if (typeof value !== "string" || !QUANTITY_PATTERN.test(value)) {
    throw new BlockSourceError(`invalid ${field}`);
  }
  return parseInt(value, HEX_RADIX);
}

function parseHex(value: unknown, pattern: RegExp, field: string): string {
  const lower = typeof value === "string" ? value.toLowerCase() : "";
  if (!pattern.test(lower)) throw new BlockSourceError(`invalid ${field}`);
  return lower;
}

/**
 * Validates one eth_getBlockByNumber result from the node.
 * @param raw - The RPC result.
 * @param expected - The height that was asked for.
 * @returns The header fields the index keeps.
 * @throws {BlockSourceError} When the block is missing or malformed.
 */
export function parseBlock(raw: unknown, expected: number): IndexedBlock {
  if (typeof raw !== "object" || raw === null) {
    throw new BlockSourceError(`block ${expected} not available`);
  }
  const block = raw as Record<string, unknown>;
  const number = parseQuantity(block.number, "block number");
  if (number !== expected) {
    throw new BlockSourceError(`asked block ${expected}, got ${number}`);
  }
  return {
    number,
    hash: parseHex(block.hash, HASH_PATTERN, "block hash"),
    parentHash: parseHex(block.parentHash, HASH_PATTERN, "parent hash"),
    timestamp: parseQuantity(block.timestamp, "timestamp"),
    miner: parseHex(block.miner, ADDRESS_PATTERN, "miner"),
  };
}

/**
 * Sends one JSON-RPC batch to the node's HTTP endpoint.
 * @param signal - Aborts the request early (indexer stop).
 * @returns The results in request order.
 * @throws {BlockSourceError} On a transport failure, a timeout or any error entry.
 */
async function postBatch(
  port: number,
  requests: readonly RpcRequest[],
  signal: AbortSignal,
): Promise<unknown[]> {
  const body = requests.map((request, id) => ({
    jsonrpc: "2.0",
    id,
    ...request,
  }));
  let replies: unknown;
  try {
    const response = await fetch(`http://127.0.0.1:${port}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(RPC_TIMEOUT_MS)]),
    });
    replies = await response.json();
  } catch (err) {
    throw new BlockSourceError(`node unreachable: ${(err as Error).message}`);
  }
  if (!Array.isArray(replies) || replies.length !== requests.length) {
    throw new BlockSourceError("node returned a malformed batch");
  }
  const results: unknown[] = Array.from({ length: requests.length });
  for (const reply of replies as {
    id?: unknown;
    result?: unknown;
    error?: { message?: unknown };
  }[]) {
    if (typeof reply?.id !== "number" || reply.id >= requests.length) {
      throw new BlockSourceError("node returned an unknown batch id");
    }
    if (reply.error) {
      throw new BlockSourceError(`node error: ${String(reply.error.message)}`);
    }
    results[reply.id] = reply.result;
  }
  return results;
}

/**
 * Reads blocks from the local geth over HTTP JSON-RPC batches, so a 100-block
 * step is one request. Every call has a timeout.
 * @param getPort - Returns the current geth HTTP port.
 * @returns The block source.
 */
export function createHttpBlockSource(getPort: () => number): BlockSource {
  return {
    async chainHead(signal) {
      const [head, genesis, syncing] = await postBatch(
        getPort(),
        [
          { method: "eth_blockNumber", params: [] },
          { method: "eth_getBlockByNumber", params: [GENESIS_TAG, false] },
          { method: "eth_syncing", params: [] },
        ],
        signal,
      );
      return {
        head: parseQuantity(head, "head"),
        genesisHash: parseBlock(genesis, 0).hash,
        isSyncing: syncing !== false,
      };
    },
    async blocks(numbers, signal) {
      const results = await postBatch(
        getPort(),
        numbers.map((n) => ({
          method: "eth_getBlockByNumber",
          params: [toQuantity(n), false],
        })),
        signal,
      );
      return results.map((raw, i) => parseBlock(raw, numbers[i]));
    },
  };
}
