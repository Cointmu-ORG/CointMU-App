import type {
  ExplorerIndexStatus,
  MinerDistributionResult,
  MinerRange,
} from "../../bridge/types";
import type { BlockIndexer } from "./blockIndexer";

/** What the main process passes to the index worker at start. */
export interface IndexWorkerData {
  readonly dir: string;
  readonly rpcPort: number;
  /** Set when a rebuild was requested while no worker ran (quarantine stops geth first). */
  readonly rebuildReason: string | null;
}

/** Messages from the main process to the index worker. */
export type IndexWorkerRequest =
  | {
      readonly type: "distribution";
      readonly id: number;
      readonly range: MinerRange;
      readonly nowSeconds: number;
    }
  | { readonly type: "status"; readonly id: number }
  | { readonly type: "rebuild"; readonly reason: string }
  | { readonly type: "stop" };

export type LogLevel = "log" | "warn" | "error";

/** Messages from the index worker to the main process. */
export type IndexWorkerMessage =
  | {
      readonly type: "reply";
      readonly id: number;
      readonly value: MinerDistributionResult | ExplorerIndexStatus | null;
    }
  | { readonly type: "log"; readonly level: LogLevel; readonly message: string }
  | { readonly type: "stopped" };

/**
 * Answers one query inside the worker. A read error requests a rebuild and
 * answers null, so the renderer keeps its last data.
 * @param indexer - The worker's indexer.
 * @param request - A distribution or status request.
 * @returns The reply value.
 */
export function answerQuery(
  indexer: BlockIndexer,
  request: Extract<IndexWorkerRequest, { id: number }>,
): MinerDistributionResult | ExplorerIndexStatus | null {
  try {
    return request.type === "distribution"
      ? indexer.minerDistribution(request.range, request.nowSeconds)
      : indexer.status();
  } catch (err) {
    console.error(`[explorer-index] ${request.type} query failed:`, err);
    indexer.requestRebuild(`${request.type} query failed`);
    return null;
  }
}
