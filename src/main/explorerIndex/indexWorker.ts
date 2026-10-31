import { format } from "node:util";
import { parentPort, workerData } from "node:worker_threads";
import { BlockIndexer } from "./blockIndexer";
import { createHttpBlockSource } from "./blockSource";
import {
  answerQuery,
  type IndexWorkerData,
  type IndexWorkerMessage,
  type IndexWorkerRequest,
  type LogLevel,
} from "./indexWorkerProtocol";

// Entry of the explorer index worker thread. The indexer and its SQLite
// connection live here, so backfill writes, VACUUM and opening a large index
// never block the main process event loop (windows, IPC).

const port = parentPort;
if (port === null) throw new Error("indexWorker must run as a worker thread");
const post = (message: IndexWorkerMessage): void => port.postMessage(message);

// electron-log only hooks the main thread's console; forward to it.
for (const level of ["log", "warn", "error"] as const satisfies LogLevel[]) {
  console[level] = (...args: unknown[]): void =>
    post({ type: "log", level, message: format(...args) });
}

const { dir, rpcPort, rebuildReason } = workerData as IndexWorkerData;
const indexer = new BlockIndexer(
  dir,
  createHttpBlockSource(() => rpcPort),
);
if (rebuildReason !== null) indexer.requestRebuild(rebuildReason);
indexer.start();

port.on("message", async (request: IndexWorkerRequest) => {
  if (request.type === "stop") {
    await indexer.stop();
    post({ type: "stopped" });
    process.exit(0);
  }
  if (request.type === "rebuild") {
    indexer.requestRebuild(request.reason);
    return;
  }
  post({ type: "reply", id: request.id, value: answerQuery(indexer, request) });
});
