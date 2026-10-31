import { ipcMain } from "electron";
import { EXPLORER_CHANNELS } from "../../bridge/ipc-channels";
import {
  MinerRange,
  type ExplorerIndexStatus,
  type MinerDistributionResult,
} from "../../bridge/types";
import type { BlockIndexer } from "../explorerIndex/blockIndexer";

const MS_PER_SECOND = 1000;
const MINER_RANGES: ReadonlySet<unknown> = new Set(Object.values(MinerRange));

/** @returns True when the renderer sent a known miner range. */
export function isMinerRange(value: unknown): value is MinerRange {
  return MINER_RANGES.has(value);
}

/**
 * Answers one miner distribution request. An index read error requests a
 * rebuild and answers null, so the renderer keeps its last data.
 * @param indexer - The running indexer, or null when it could not start.
 * @param range - The renderer payload, validated here.
 * @returns The distribution, or null when the index cannot answer.
 * @throws {TypeError} When the range is not a MinerRange.
 */
export function answerMinerDistribution(
  indexer: BlockIndexer | null,
  range: unknown,
): MinerDistributionResult | null {
  if (!isMinerRange(range)) {
    throw new TypeError(
      `${EXPLORER_CHANNELS.GET_MINER_DISTRIBUTION}: invalid range`,
    );
  }
  if (indexer === null) return null;
  try {
    return indexer.minerDistribution(
      range,
      Math.floor(Date.now() / MS_PER_SECOND),
    );
  } catch (err) {
    console.error("[explorer-index] Miner distribution query failed:", err);
    indexer.requestRebuild("query failed");
    return null;
  }
}

/**
 * @param indexer - The running indexer, or null when it could not start.
 * @returns The index status, or null when the index cannot answer.
 */
export function answerIndexStatus(
  indexer: BlockIndexer | null,
): ExplorerIndexStatus | null {
  try {
    return indexer?.status() ?? null;
  } catch (err) {
    console.error("[explorer-index] Status query failed:", err);
    indexer?.requestRebuild("status query failed");
    return null;
  }
}

/**
 * Registers the explorer index queries: the miner distribution of a range and
 * the index status (backfill progress).
 * @param getIndexer - Returns the running indexer, or null.
 */
export function registerExplorerHandlers(
  getIndexer: () => BlockIndexer | null,
): void {
  ipcMain.handle(
    EXPLORER_CHANNELS.GET_MINER_DISTRIBUTION,
    (_, range: unknown) => answerMinerDistribution(getIndexer(), range),
  );
  ipcMain.handle(EXPLORER_CHANNELS.GET_INDEX_STATUS, () =>
    answerIndexStatus(getIndexer()),
  );
}
