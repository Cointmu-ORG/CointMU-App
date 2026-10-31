import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExplorerIndexPhase,
  MinerRange,
  type MinerDistributionResult,
} from "@bridge/types";
import {
  fetchMinerDistribution,
  getCachedMinerDistribution,
} from "./miner-distribution.service";

const getMinerDistribution = vi.fn();

const WEEK_RESULT: MinerDistributionResult = {
  range: MinerRange.WEEK,
  miners: [{ address: "0xaa", blocks: 3 }],
  otherBlocks: 0,
  totalBlocks: 3,
  isComplete: true,
  status: {
    phase: ExplorerIndexPhase.SYNCED,
    lowestBlock: 0,
    highestBlock: 3,
    nodeHead: 3,
    percent: 100,
  },
};

beforeEach(() => {
  getMinerDistribution.mockReset();
  vi.stubGlobal("window", { api: { explorer: { getMinerDistribution } } });
});

describe("fetchMinerDistribution", () => {
  it("returns null before any data, and the last data when the index cannot answer", async () => {
    getMinerDistribution.mockResolvedValue(null);
    expect(await fetchMinerDistribution(MinerRange.WEEK)).toBeNull();

    getMinerDistribution.mockResolvedValueOnce(WEEK_RESULT);
    const fresh = await fetchMinerDistribution(MinerRange.WEEK);
    const afterFailure = await fetchMinerDistribution(MinerRange.WEEK);

    expect(fresh?.entries).toEqual([
      { address: "0xaa", blocksMined: 3, percentage: 100 },
    ]);
    expect(afterFailure).toBe(fresh);
    expect(getCachedMinerDistribution(MinerRange.WEEK)).toBe(fresh);
    expect(getCachedMinerDistribution(MinerRange.MONTH)).toBeUndefined();
  });
});
