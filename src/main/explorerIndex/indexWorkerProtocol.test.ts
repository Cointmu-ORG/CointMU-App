import { describe, expect, it, vi } from "vitest";
import { MinerRange } from "../../bridge/types";
import type { BlockIndexer } from "./blockIndexer";
import { answerQuery } from "./indexWorkerProtocol";

/** An indexer stub whose reads throw, like a database that broke at runtime. */
function brokenIndexer(): BlockIndexer {
  const fail = (): never => {
    throw new Error("database disk image is malformed");
  };
  return {
    minerDistribution: fail,
    status: fail,
    requestRebuild: vi.fn(),
  } as unknown as BlockIndexer;
}

describe("answerQuery", () => {
  it("answers null and requests a rebuild when a read fails", () => {
    const indexer = brokenIndexer();
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      answerQuery(indexer, {
        type: "distribution",
        id: 1,
        range: MinerRange.ALL,
        nowSeconds: 0,
      }),
    ).toBeNull();
    expect(answerQuery(indexer, { type: "status", id: 2 })).toBeNull();
    expect(indexer.requestRebuild).toHaveBeenCalledTimes(2);
  });
});
