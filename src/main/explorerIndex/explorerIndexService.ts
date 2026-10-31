import { app } from "electron";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import ms from "ms";
import type {
  ExplorerIndexStatus,
  MinerDistributionResult,
  MinerRange,
} from "../../bridge/types";
import { getNetworkId } from "../geth/networkConfig";
import { getRpcPort } from "../geth/ports";
import type {
  IndexWorkerData,
  IndexWorkerMessage,
  IndexWorkerRequest,
} from "./indexWorkerProtocol";

const INDEX_DIR_NAME = "explorer-index";
// Built next to index.js as its own entry (electron.vite.config.ts).
const WORKER_FILE_NAME = "indexWorker.js";
// A VACUUM holds the worker for ~0.5 s per 300k blocks; queries wait for it.
const REQUEST_TIMEOUT_MS = ms("5s");
// Stop never holds up quit or a geth restart longer than this.
const STOP_TIMEOUT_MS = ms("2s");
const MS_PER_SECOND = 1000;

type Reply = MinerDistributionResult | ExplorerIndexStatus | null;
type Query =
  | {
      readonly type: "distribution";
      readonly range: MinerRange;
      readonly nowSeconds: number;
    }
  | { readonly type: "status" };

let worker: Worker | null = null;
let pendingRebuildReason: string | null = null;
let nextRequestId = 1;
const pending = new Map<number, (value: Reply) => void>();

function onWorkerMessage(message: IndexWorkerMessage): void {
  if (message.type === "log") console[message.level](message.message);
  if (message.type === "reply") pending.get(message.id)?.(message.value);
}

function onWorkerExit(exited: Worker, code: number): void {
  if (worker === exited) {
    worker = null;
    console.error(`[explorer-index] Index worker exited (code ${code})`);
  }
  for (const resolve of pending.values()) resolve(null);
}

/**
 * Starts the explorer block index of the active network in a worker thread,
 * stored in <userData>/explorer-index/<networkId> apart from the chaindata.
 * Called after every geth spawn; a no-op while the worker runs. When the worker
 * cannot start, queries answer null and the app runs on.
 */
export function startExplorerIndex(): void {
  if (worker !== null) return;
  const workerData: IndexWorkerData = {
    dir: join(app.getPath("userData"), INDEX_DIR_NAME, getNetworkId()),
    rpcPort: getRpcPort(),
    rebuildReason: pendingRebuildReason,
  };
  pendingRebuildReason = null;
  try {
    const started = new Worker(join(__dirname, WORKER_FILE_NAME), {
      workerData,
    });
    started.on("message", onWorkerMessage);
    started.on("error", (err) =>
      console.error("[explorer-index] Index worker failed:", err),
    );
    started.on("exit", (code) => onWorkerExit(started, code));
    worker = started;
    console.log("[explorer-index] Index worker started");
  } catch (err) {
    console.error("[explorer-index] Could not start the index worker:", err);
  }
}

function query(request: Query): Promise<Reply> {
  const target = worker;
  if (target === null) return Promise.resolve(null);
  const id = nextRequestId++;
  return new Promise((resolve) => {
    const settle = (value: Reply): void => {
      clearTimeout(timer);
      pending.delete(id);
      resolve(value);
    };
    const timer = setTimeout(() => settle(null), REQUEST_TIMEOUT_MS);
    pending.set(id, settle);
    target.postMessage({ ...request, id } satisfies IndexWorkerRequest);
  });
}

/** @returns The miner distribution of a range, or null when the index cannot answer. */
export function queryMinerDistribution(
  range: MinerRange,
): Promise<MinerDistributionResult | null> {
  const nowSeconds = Math.floor(Date.now() / MS_PER_SECOND);
  return query({
    type: "distribution",
    range,
    nowSeconds,
  }) as Promise<MinerDistributionResult | null>;
}

/** @returns The index status, or null when the index cannot answer. */
export function queryIndexStatus(): Promise<ExplorerIndexStatus | null> {
  return query({ type: "status" }) as Promise<ExplorerIndexStatus | null>;
}

/**
 * Wipes the index before its next step, e.g. after chaindata was quarantined.
 * Recovery stops geth (and with it the worker) first, so a request made while
 * no worker runs is carried to the next start.
 */
export function requestIndexRebuild(reason: string): void {
  if (worker === null) {
    pendingRebuildReason = reason;
    return;
  }
  worker.postMessage({ type: "rebuild", reason } satisfies IndexWorkerRequest);
}

/**
 * Stops the worker: it ends its loop, checkpoints the WAL and closes the
 * database. Resolves once the worker exited, or after STOP_TIMEOUT_MS when it
 * is terminated instead (SQLite keeps the WAL consistent either way).
 */
export async function stopExplorerIndex(): Promise<void> {
  const stopping = worker;
  if (stopping === null) return;
  worker = null;
  const exited = new Promise<void>((resolve) =>
    stopping.once("exit", () => resolve()),
  );
  const timer = setTimeout(() => {
    console.warn(
      "[explorer-index] Index worker did not stop in time; terminating",
    );
    void stopping.terminate();
  }, STOP_TIMEOUT_MS);
  const startedMs = Date.now();
  stopping.postMessage({ type: "stop" } satisfies IndexWorkerRequest);
  await exited;
  clearTimeout(timer);
  console.log(
    `[explorer-index] Index worker stopped in ${Date.now() - startedMs} ms`,
  );
}
