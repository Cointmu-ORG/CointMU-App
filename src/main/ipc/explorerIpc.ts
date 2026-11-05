import { ipcMain } from "electron";
import { EXPLORER_CHANNELS } from "../../bridge/ipc-channels";
import {
  MinerRange,
  type ExplorerIndexStatus,
  type MinerDistributionResult,
} from "../../bridge/types";

const MINER_RANGES: ReadonlySet<unknown> = new Set(Object.values(MinerRange));

/** The index queries the handlers answer from (the index worker in the app). */
export interface ExplorerIndexQueries {
  readonly minerDistribution: (
    range: MinerRange,
  ) => Promise<MinerDistributionResult | null>;
  readonly status: () => Promise<ExplorerIndexStatus | null>;
  /** Wipes the index; it refills from the node in the background. */
  readonly rebuild: (reason: string) => void;
}

/** @returns True when the renderer sent a known miner range. */
export function isMinerRange(value: unknown): value is MinerRange {
  return MINER_RANGES.has(value);
}

/**
 * Validates the renderer payload, then asks the index.
 * @param queries - The index queries.
 * @param range - The renderer payload.
 * @returns The distribution, or null when the index cannot answer.
 * @throws {TypeError} When the range is not a MinerRange.
 */
export function answerMinerDistribution(
  queries: ExplorerIndexQueries,
  range: unknown,
): Promise<MinerDistributionResult | null> {
  if (!isMinerRange(range)) {
    throw new TypeError(
      `${EXPLORER_CHANNELS.GET_MINER_DISTRIBUTION}: invalid range`,
    );
  }
  return queries.minerDistribution(range);
}

/**
 * Registers the explorer index queries: the miner distribution of a range,
 * the index status (backfill progress), and the user's rebuild (Settings →
 * General → Reset explorer cache).
 * @param queries - The index queries.
 */
export function registerExplorerHandlers(queries: ExplorerIndexQueries): void {
  ipcMain.handle(
    EXPLORER_CHANNELS.GET_MINER_DISTRIBUTION,
    (_, range: unknown) => answerMinerDistribution(queries, range),
  );
  ipcMain.handle(EXPLORER_CHANNELS.GET_INDEX_STATUS, () => queries.status());
  ipcMain.handle(EXPLORER_CHANNELS.REBUILD_INDEX, () => {
    queries.rebuild("reset by the user");
  });
}
