import { describe, expect, it } from "vitest";
import {
  ExplorerIndexPhase,
  MinerRange,
  type MinerDistributionResult,
} from "@bridge/types";
import { OTHERS_ADDRESS, toMinerDistribution } from "./miner-distribution.util";

const STATUS = {
  phase: ExplorerIndexPhase.INDEXING,
  lowestBlock: 600,
  highestBlock: 1000,
  nodeHead: 1000,
  percent: 40.1,
};

function result(
  overrides: Partial<MinerDistributionResult>,
): MinerDistributionResult {
  return {
    range: MinerRange.WEEK,
    miners: [],
    otherBlocks: 0,
    totalBlocks: 0,
    isComplete: false,
    status: STATUS,
    ...overrides,
  };
}

describe("toMinerDistribution", () => {
  it("turns block counts into shares and appends the others row", () => {
    const distribution = toMinerDistribution(
      result({
        miners: [
          { address: "0xaa", blocks: 6 },
          { address: "0xbb", blocks: 2 },
        ],
        otherBlocks: 2,
        totalBlocks: 10,
        isComplete: true,
      }),
    );

    expect(distribution).toEqual({
      entries: [
        { address: "0xaa", blocksMined: 6, percentage: 60 },
        { address: "0xbb", blocksMined: 2, percentage: 20 },
        { address: OTHERS_ADDRESS, blocksMined: 2, percentage: 20 },
      ],
      totalBlocks: 10,
      isComplete: true,
      progress: {
        phase: ExplorerIndexPhase.INDEXING,
        percent: 40.1,
        highestBlock: 1000,
      },
    });
  });

  it("keeps an empty, partial range empty without dividing by zero", () => {
    const distribution = toMinerDistribution(result({}));

    expect(distribution.entries).toEqual([]);
    expect(distribution.isComplete).toBe(false);
  });
});
