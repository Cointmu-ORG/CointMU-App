import type {
  ExplorerIndexPhase,
  MinerDistributionResult,
} from "@bridge/types";

/** The address of the row that sums every miner beyond the top ones. */
export const OTHERS_ADDRESS = "others";
const PERCENT = 100;

/**
 * Represents a single entry in the miner distribution report.
 */
export interface MinerEntry {
  /** A lowercase 0x address, or OTHERS_ADDRESS. */
  address: string;
  blocksMined: number;
  percentage: number;
}

/** How far the local block index has come, for the partial-data notice. */
export interface MinerIndexProgress {
  phase: ExplorerIndexPhase;
  /** Indexed share of the chain, 0-100. */
  percent: number;
  /** The highest indexed block, or null when nothing is indexed. */
  highestBlock: number | null;
}

/** A miner distribution ready for display. */
export interface MinerDistribution {
  /** The top miners, most blocks first, then the OTHERS_ADDRESS row if any. */
  entries: MinerEntry[];
  totalBlocks: number;
  /** False while the index does not cover the whole range yet. */
  isComplete: boolean;
  progress: MinerIndexProgress;
}

/**
 * Maps the main-process miner distribution into display entries with shares.
 * @param result - The IPC payload.
 * @returns The entries, coverage and index progress.
 */
export function toMinerDistribution(
  result: MinerDistributionResult,
): MinerDistribution {
  const share = (blocks: number): number =>
    result.totalBlocks === 0 ? 0 : (blocks / result.totalBlocks) * PERCENT;
  const entries: MinerEntry[] = result.miners.map((miner) => ({
    address: miner.address,
    blocksMined: miner.blocks,
    percentage: share(miner.blocks),
  }));
  if (result.otherBlocks > 0) {
    entries.push({
      address: OTHERS_ADDRESS,
      blocksMined: result.otherBlocks,
      percentage: share(result.otherBlocks),
    });
  }
  return {
    entries,
    totalBlocks: result.totalBlocks,
    isComplete: result.isComplete,
    progress: {
      phase: result.status.phase,
      percent: result.status.percent,
      highestBlock: result.status.highestBlock,
    },
  };
}
