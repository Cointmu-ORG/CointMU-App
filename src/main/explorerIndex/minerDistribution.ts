import {
  MinerRange,
  type ExplorerIndexStatus,
  type MinerDistributionResult,
  type MinerShare,
} from "../../bridge/types";
import type { BlockStore } from "./blockStore";

/** Miners listed by name; the rest are summed into otherBlocks. */
export const TOP_MINERS_LIMIT = 5;
const SECONDS_PER_DAY = 86_400;
const RANGE_DAYS = { [MinerRange.WEEK]: 7, [MinerRange.MONTH]: 30 } as const;

/** @returns The Unix second a range starts at; 0 for all time. */
export function rangeStart(range: MinerRange, nowSeconds: number): number {
  return range === MinerRange.ALL
    ? 0
    : nowSeconds - RANGE_DAYS[range] * SECONDS_PER_DAY;
}

/**
 * True when the index holds every block of the range up to the node head: it
 * reaches the node head, and either genesis or a block older than the range.
 */
function coversRange(
  store: BlockStore,
  status: ExplorerIndexStatus,
  since: number,
): boolean {
  const { lowestBlock, highestBlock, nodeHead } = status;
  if (lowestBlock === null || highestBlock === null || nodeHead === null) {
    return false;
  }
  if (highestBlock < nodeHead) return false;
  if (lowestBlock === 0) return true;
  const lowest = store.blockAt(lowestBlock);
  return lowest !== null && lowest.timestamp <= since;
}

/**
 * Builds the miner distribution of a time range from the block index.
 * @param store - The open block index.
 * @param status - The index status the result reports.
 * @param range - The time window.
 * @param nowSeconds - The current Unix time.
 * @returns The top miners, the rest as one sum, and whether the range is complete.
 */
export function buildMinerDistribution(
  store: BlockStore,
  status: ExplorerIndexStatus,
  range: MinerRange,
  nowSeconds: number,
): MinerDistributionResult {
  const since = rangeStart(range, nowSeconds);
  const shares: MinerShare[] = [...store.countByMiner(since)]
    .filter(([, blocks]) => blocks > 0)
    .map(([address, blocks]) => ({ address, blocks }))
    .sort((a, b) => b.blocks - a.blocks || a.address.localeCompare(b.address));
  const totalBlocks = shares.reduce((sum, share) => sum + share.blocks, 0);
  const miners = shares.slice(0, TOP_MINERS_LIMIT);
  const topBlocks = miners.reduce((sum, share) => sum + share.blocks, 0);
  return {
    range,
    miners,
    otherBlocks: totalBlocks - topBlocks,
    totalBlocks,
    isComplete: coversRange(store, status, since),
    status,
  };
}
