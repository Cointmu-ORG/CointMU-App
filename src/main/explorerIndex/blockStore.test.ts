import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addressOf,
  BLOCK_TIME_SECONDS,
  buildChain,
  SECONDS_PER_DAY,
} from "./blockIndex.fixtures";
import { BlockStore, BlockStoreInvalidError } from "./blockStore";

const HEAD_TIME = 1_800_000_000;
const MINER_A = addressOf(0xa);
const MINER_B = addressOf(0xb);

let dir: string;
let store: BlockStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "block-store-"));
  store = BlockStore.open(dir);
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("BlockStore.countByMiner", () => {
  it("counts per range across day boundaries and skips genesis", () => {
    // Two days of blocks: MINER_A mined the older day, MINER_B the newer one.
    const length = Math.floor((2 * SECONDS_PER_DAY) / BLOCK_TIME_SECONDS) + 1;
    const timeOf = (n: number): number =>
      HEAD_TIME - (length - 1 - n) * BLOCK_TIME_SECONDS;
    const chain = buildChain({
      length,
      headTime: HEAD_TIME,
      minerOf: (n) =>
        timeOf(n) < HEAD_TIME - SECONDS_PER_DAY ? MINER_A : MINER_B,
    });
    store.insert(chain);
    const brute = (since: number): Map<string, number> => {
      const counts = new Map<string, number>();
      for (const block of chain.slice(1)) {
        if (block.timestamp >= since)
          counts.set(block.miner, (counts.get(block.miner) ?? 0) + 1);
      }
      return counts;
    };

    for (const since of [
      0,
      HEAD_TIME - SECONDS_PER_DAY,
      HEAD_TIME - 3600,
      HEAD_TIME - 7 * SECONDS_PER_DAY,
      HEAD_TIME + 1,
    ]) {
      expect(store.countByMiner(since)).toEqual(brute(since));
    }
    expect(store.countByMiner(0).get(MINER_A)).toBeGreaterThan(0);
  });

  it("keeps the per-day counts in step when blocks are rolled back", () => {
    const chain = buildChain({
      length: 50,
      headTime: HEAD_TIME,
      minerOf: (n) => (n % 2 ? MINER_A : MINER_B),
    });
    store.insert(chain);

    store.deleteAbove(9);

    expect(store.range()).toEqual({ low: 0, high: 9 });
    expect(store.countByMiner(0)).toEqual(
      new Map([
        [MINER_A, 5],
        [MINER_B, 4],
      ]),
    );
  });
});

describe("BlockStore.open", () => {
  it("reopens the saved range, genesis hash and hashes", () => {
    const chain = buildChain({ length: 10, headTime: HEAD_TIME });
    store.insert(chain.slice(4));
    store.setGenesisHash(chain[0].hash);
    store.close();

    store = BlockStore.open(dir);

    expect(store.range()).toEqual({ low: 4, high: 9 });
    expect(store.genesisHash()).toBe(chain[0].hash);
    expect(store.blockAt(7)).toEqual({
      hash: chain[7].hash,
      parentHash: chain[6].hash,
      timestamp: chain[7].timestamp,
    });
  });

  it("rejects an index with a gap", () => {
    const chain = buildChain({ length: 10, headTime: HEAD_TIME });
    store.insert([chain[2], chain[3], chain[7]]);
    store.close();

    expect(() => BlockStore.open(dir)).toThrow(BlockStoreInvalidError);
    store = BlockStore.open(join(dir, "fresh"));
  });
});
