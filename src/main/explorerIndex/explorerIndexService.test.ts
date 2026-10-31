import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MinerRange } from "../../bridge/types";

/** A worker_threads.Worker stand-in that records what main sends it. */
class FakeWorker extends EventEmitter {
  static created: FakeWorker[] = [];
  readonly sent: { type: string }[] = [];
  readonly terminate = vi.fn(async () => {
    this.emit("exit", 1);
    return 1;
  });

  constructor(
    readonly file: string,
    readonly options: { workerData: { rebuildReason: string | null } },
  ) {
    super();
    FakeWorker.created.push(this);
  }

  postMessage(message: { type: string }): void {
    this.sent.push(message);
  }
}

vi.mock("electron", () => ({ app: { getPath: () => "/user-data" } }));
vi.mock("node:worker_threads", () => ({ Worker: FakeWorker }));
vi.mock("../geth/networkConfig", () => ({ getNetworkId: () => "1912" }));
vi.mock("../geth/ports", () => ({ getRpcPort: () => 8585 }));

const service = await import("./explorerIndexService");

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  FakeWorker.created = [];
});

afterEach(async () => {
  const stopping = service.stopExplorerIndex();
  FakeWorker.created.at(-1)?.emit("exit", 0);
  await stopping;
  vi.useRealTimers();
});

describe("explorerIndexService", () => {
  it("carries a rebuild requested while stopped to the next worker", () => {
    service.requestIndexRebuild("chaindata quarantined");
    service.startExplorerIndex();

    expect(FakeWorker.created[0].options.workerData).toMatchObject({
      dir: expect.stringContaining("1912"),
      rpcPort: 8585,
      rebuildReason: "chaindata quarantined",
    });
  });

  it("terminates a worker that does not stop within the bound", async () => {
    service.startExplorerIndex();
    const [worker] = FakeWorker.created;

    const stopping = service.stopExplorerIndex();
    await vi.advanceTimersByTimeAsync(2000);
    await stopping;

    expect(worker.sent.at(-1)).toEqual({ type: "stop" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("answers null when the worker does not reply in time", async () => {
    service.startExplorerIndex();

    const answer = service.queryMinerDistribution(MinerRange.WEEK);
    await vi.advanceTimersByTimeAsync(5000);

    expect(await answer).toBeNull();
  });

  it("answers null without a worker", async () => {
    expect(await service.queryIndexStatus()).toBeNull();
  });
});
