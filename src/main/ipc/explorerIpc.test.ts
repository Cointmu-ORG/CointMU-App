import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));

import { MinerRange } from "../../bridge/types";
import {
  answerMinerDistribution,
  type ExplorerIndexQueries,
} from "./explorerIpc";

function queries(): ExplorerIndexQueries {
  return {
    minerDistribution: vi.fn(async () => null),
    status: vi.fn(async () => null),
  };
}

describe("answerMinerDistribution", () => {
  it.each(["weekly", "", 7, null, undefined, { range: "week" }])(
    "rejects the payload %j without asking the index",
    (payload) => {
      const index = queries();

      expect(() => answerMinerDistribution(index, payload)).toThrow(TypeError);
      expect(index.minerDistribution).not.toHaveBeenCalled();
    },
  );

  it("passes a valid range to the index", async () => {
    const index = queries();

    expect(await answerMinerDistribution(index, MinerRange.MONTH)).toBeNull();
    expect(index.minerDistribution).toHaveBeenCalledWith(MinerRange.MONTH);
  });
});
