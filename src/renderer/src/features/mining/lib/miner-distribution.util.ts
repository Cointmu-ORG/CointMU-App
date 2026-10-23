import { call } from "@/shared/api";
import {
  SECONDS_IN_DAY,
  TOP_MINERS_LIMIT,
  MAX_BLOCKS_TO_SCAN,
} from "../config/mining.constants";

/**
 * Represents a single entry in the miner distribution report.
 */
export interface MinerEntry {
  address: string;
  blocksMined: number;
  percentage: number;
}

/**
 * Fetches recent blocks from the local node by iterating backwards from
 * 'latest', tallying miner addresses within a strict 24-hour UTC window.
 * Scanning stops as soon as a block timestamp is older than 24 hours ago
 * or a safety cap of scanned blocks is reached.
 * @returns {Promise<MinerEntry[]>} A promise resolving to a sorted, capped array of miner entries
 *          where any miners beyond the top 5 are folded into an 'Others'
 *          entry. Returns an empty array if no blocks were found.
 */
export async function fetchMinerDistribution(): Promise<MinerEntry[]> {
  const cutoffSeconds = Math.floor((Date.now() - SECONDS_IN_DAY * 1000) / 1000);

  const latestHex: string = await call("eth_blockNumber", []);
  let currentBlock = parseInt(latestHex, 16);

  if (isNaN(currentBlock) || currentBlock < 0) return [];

  const tally = new Map<string, number>();
  let totalBlocks = 0;
  let scanned = 0;

  while (currentBlock >= 0 && scanned < MAX_BLOCKS_TO_SCAN) {
    const block: { miner: string; timestamp: string } | null = await call(
      "eth_getBlockByNumber",
      ["0x" + currentBlock.toString(16), false],
    );

    if (!block) break;

    const blockTimestamp = parseInt(block.timestamp, 16);
    if (blockTimestamp < cutoffSeconds) break;

    const miner = block.miner.toLowerCase();
    tally.set(miner, (tally.get(miner) ?? 0) + 1);
    totalBlocks++;
    currentBlock--;
    scanned++;
  }

  if (totalBlocks === 0) return [];

  const sorted: MinerEntry[] = Array.from(tally.entries())
    .map(([address, blocksMined]) => ({
      address,
      blocksMined,
      percentage: (blocksMined / totalBlocks) * 100,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const top = sorted.slice(0, TOP_MINERS_LIMIT);
  const rest = sorted.slice(TOP_MINERS_LIMIT);

  if (rest.length > 0) {
    const othersBlocks = rest.reduce((acc, m) => acc + m.blocksMined, 0);
    top.push({
      address: "others",
      blocksMined: othersBlocks,
      percentage: (othersBlocks / totalBlocks) * 100,
    });
  }

  return top;
}
