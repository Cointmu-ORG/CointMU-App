import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));

import { MinerRange } from "../../bridge/types";
import type { BlockIndexer } from "../explorerIndex/blockIndexer";
import { answerIndexStatus, answerMinerDistribution } from "./explorerIpc";

/** An indexer stub whose queries throw, like a database that broke at runtime. */
function brokenIndexer(): BlockIndexer & {
  requestRebuild: ReturnType<typeof vi.fn>;
} {
  const fail = (): never => {
    throw new Error("database disk image is malformed");
  };
  return {
    minerDistribution: fail,
    status: fail,
    requestRebuild: vi.fn(),
  } as unknown as BlockIndexer & {
    requestRebuild: ReturnType<typeof vi.fn>;
  };
}

describe("answerMinerDistribution", () => {
  it.each(["weekly", "", 7, null, undefined, { range: "week" }])(
    "rejects the payload %j",
    (payload) => {
      expect(() => answerMinerDistribution(null, payload)).toThrow(TypeError);
    },
  );

  it("answers null when the index could not start", () => {
    expect(answerMinerDistribution(null, MinerRange.WEEK)).toBeNull();
  });

  it("answers null and requests a rebuild when the index read fails", () => {
    const indexer = brokenIndexer();

    expect(answerMinerDistribution(indexer, MinerRange.ALL)).toBeNull();
    expect(answerIndexStatus(indexer)).toBeNull();
    expect(indexer.requestRebuild).toHaveBeenCalledTimes(2);
  });
});
