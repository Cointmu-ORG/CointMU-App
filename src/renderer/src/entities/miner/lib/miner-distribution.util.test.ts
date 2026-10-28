import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("@/shared/api", () => ({ call }));

import {
  MAX_BLOCKS_TO_SCAN,
  SECONDS_IN_DAY,
  TOP_MINERS_LIMIT,
} from "../config/miner.constants";
import { fetchMinerDistribution } from "./miner-distribution.util";

const NOW_SECONDS = 1_800_000_000;
const RECENT = NOW_SECONDS - 60;
const TOO_OLD = NOW_SECONDS - SECONDS_IN_DAY - 1;

/** Serves blocks newest first: blocks[0] is the latest. */
function serveChain(blocks: { miner: string; timestamp: number }[]): void {
  const latest = blocks.length - 1;
  call.mockImplementation(async (method: string, params: unknown[]) => {
    if (method === "eth_blockNumber") return "0x" + latest.toString(16);
    const number = parseInt(params[0] as string, 16);
    const block = blocks[latest - number];
    return block
      ? { miner: block.miner, timestamp: "0x" + block.timestamp.toString(16) }
      : null;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_SECONDS * 1000);
  call.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchMinerDistribution", () => {
  it("tallies the last 24 h per lowercased miner, largest share first", async () => {
    serveChain([
      { miner: "0xAA", timestamp: RECENT },
      { miner: "0xbb", timestamp: RECENT },
      { miner: "0xaa", timestamp: RECENT },
      { miner: "0xaa", timestamp: RECENT },
      { miner: "0xcc", timestamp: TOO_OLD },
    ]);

    expect(await fetchMinerDistribution()).toEqual([
      { address: "0xaa", blocksMined: 3, percentage: 75 },
      { address: "0xbb", blocksMined: 1, percentage: 25 },
    ]);
  });

  it(`folds miners beyond the top ${TOP_MINERS_LIMIT} into "others"`, async () => {
    const miners = Array.from(
      { length: TOP_MINERS_LIMIT + 2 },
      (_, i) => `0x${i}`,
    );
    serveChain(miners.map((miner) => ({ miner, timestamp: RECENT })));

    const entries = await fetchMinerDistribution();

    expect(entries).toHaveLength(TOP_MINERS_LIMIT + 1);
    expect(entries.at(-1)).toMatchObject({ address: "others", blocksMined: 2 });
  });

  it("returns nothing when no block is recent", async () => {
    serveChain([{ miner: "0xaa", timestamp: TOO_OLD }]);

    expect(await fetchMinerDistribution()).toEqual([]);
  });

  it("returns nothing for an unreadable block number", async () => {
    call.mockResolvedValueOnce("not hex");

    expect(await fetchMinerDistribution()).toEqual([]);
  });

  it(`scans at most ${MAX_BLOCKS_TO_SCAN} blocks`, async () => {
    serveChain(
      Array.from({ length: MAX_BLOCKS_TO_SCAN + 10 }, () => ({
        miner: "0xaa",
        timestamp: RECENT,
      })),
    );

    const [entry] = await fetchMinerDistribution();

    expect(entry.blocksMined).toBe(MAX_BLOCKS_TO_SCAN);
  });
});
