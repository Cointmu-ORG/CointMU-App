import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExplorerIndexPhase, MinerRange } from "../../bridge/types";
import {
  addressOf,
  buildChain,
  FakeBlockSource,
  SECONDS_PER_DAY,
} from "./blockIndex.fixtures";
import {
  BATCH_BLOCKS,
  BlockIndexer,
  MAX_REORG_DEPTH,
  StepOutcome,
} from "./blockIndexer";

const NOW = 1_800_000_000;
const MINER_A = addressOf(0xa);
const MINER_B = addressOf(0xb);
const LONG_CHAIN = 5 * BATCH_BLOCKS + 7;

let dir: string;
let indexers: BlockIndexer[];

/** Creates an indexer over `source` in the test directory and tracks it for cleanup. */
function indexerFor(source: FakeBlockSource): BlockIndexer {
  const indexer = new BlockIndexer(dir, source);
  indexers.push(indexer);
  return indexer;
}

/** Steps until the indexer reports nothing left to do. */
async function stepUntilIdle(indexer: BlockIndexer): Promise<number> {
  for (let steps = 1; steps < 1000; steps++) {
    if ((await indexer.step()) === StepOutcome.IDLE) return steps;
  }
  throw new Error("indexer never went idle");
}

const allTime = (
  indexer: BlockIndexer,
): ReturnType<BlockIndexer["minerDistribution"]> =>
  indexer.minerDistribution(MinerRange.ALL, NOW);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "block-indexer-"));
  indexers = [];
});

afterEach(async () => {
  for (const indexer of indexers) await indexer.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("BlockIndexer backfill", () => {
  it("indexes from the head down to genesis in batches, then idles", async () => {
    const source = new FakeBlockSource(
      buildChain({ length: LONG_CHAIN, headTime: NOW }),
    );
    const indexer = indexerFor(source);

    await indexer.step();
    expect(indexer.status()).toMatchObject({
      lowestBlock: LONG_CHAIN - 1,
      highestBlock: LONG_CHAIN - 1,
    });

    await stepUntilIdle(indexer);

    expect(indexer.status()).toEqual({
      phase: ExplorerIndexPhase.SYNCED,
      lowestBlock: 0,
      highestBlock: LONG_CHAIN - 1,
      nodeHead: LONG_CHAIN - 1,
      percent: 100,
    });
    expect(allTime(indexer)).toMatchObject({
      totalBlocks: LONG_CHAIN - 1,
      isComplete: true,
    });
  });

  it("serves the recent range as complete before the backfill reaches genesis", async () => {
    // Ten-minute blocks keep the week small: a week plus ten older batches.
    const blockTimeSeconds = 600;
    const weekBlocks = (7 * SECONDS_PER_DAY) / blockTimeSeconds + 1;
    const length = weekBlocks + 10 * BATCH_BLOCKS;
    const indexer = indexerFor(
      new FakeBlockSource(
        buildChain({ length, headTime: NOW, blockTimeSeconds }),
      ),
    );

    for (let i = 0; i < Math.ceil(weekBlocks / BATCH_BLOCKS) + 2; i++)
      await indexer.step();

    const week = indexer.minerDistribution(MinerRange.WEEK, NOW);
    expect(week).toMatchObject({ isComplete: true, totalBlocks: weekBlocks });
    expect(allTime(indexer).isComplete).toBe(false);
    expect(indexer.status().phase).toBe(ExplorerIndexPhase.INDEXING);
    expect(indexer.status().percent).toBeLessThan(100);
  });

  it("resumes the backfill after a restart instead of starting over", async () => {
    const source = new FakeBlockSource(
      buildChain({ length: LONG_CHAIN, headTime: NOW }),
    );
    const first = indexerFor(source);
    for (let i = 0; i < 3; i++) await first.step();
    const saved = first.status();
    await first.stop();
    indexers = [];
    source.blockRequests = 0;

    const second = indexerFor(source);
    expect(second.status()).toMatchObject({
      lowestBlock: saved.lowestBlock,
      highestBlock: saved.highestBlock,
    });
    await stepUntilIdle(second);

    expect(second.status().lowestBlock).toBe(0);
    // Only the blocks below the saved range were fetched: one backfill batch
    // and one tip check per step, plus the final tip check.
    const remainingBatches = Math.ceil((saved.lowestBlock ?? 0) / BATCH_BLOCKS);
    expect(remainingBatches).toBeLessThan(Math.ceil(LONG_CHAIN / BATCH_BLOCKS));
    expect(source.blockRequests).toBe(2 * remainingBatches + 1);
  });

  it("follows new blocks at the tip", async () => {
    const source = new FakeBlockSource(
      buildChain({ length: 20, headTime: NOW, minerOf: () => MINER_A }),
    );
    const indexer = indexerFor(source);
    await stepUntilIdle(indexer);

    source.chain = buildChain({
      length: 25,
      headTime: NOW + 65,
      minerOf: (n) => (n < 20 ? MINER_A : MINER_B),
    });
    await stepUntilIdle(indexer);

    expect(indexer.status().highestBlock).toBe(24);
    expect(allTime(indexer).miners).toEqual([
      { address: MINER_A, blocks: 19 },
      { address: MINER_B, blocks: 5 },
    ]);
  });
});

describe("BlockIndexer reorg and reset", () => {
  it("rolls a reorged tip back to the common block and re-indexes the new branch", async () => {
    const source = new FakeBlockSource(
      buildChain({ length: 40, headTime: NOW, minerOf: () => MINER_A }),
    );
    const indexer = indexerFor(source);
    await stepUntilIdle(indexer);

    // Blocks 35+ are replaced by a branch MINER_B mined, one block longer.
    source.chain = buildChain({
      length: 41,
      headTime: NOW + 13,
      forkFrom: 35,
      fork: 1,
      minerOf: (n) => (n >= 35 ? MINER_B : MINER_A),
    });
    await stepUntilIdle(indexer);

    expect(indexer.status()).toMatchObject({
      lowestBlock: 0,
      highestBlock: 40,
    });
    expect(allTime(indexer).miners).toEqual([
      { address: MINER_A, blocks: 34 },
      { address: MINER_B, blocks: 6 },
    ]);
  });

  it("handles a same-height reorg found by the tip check", async () => {
    const source = new FakeBlockSource(
      buildChain({ length: 30, headTime: NOW, minerOf: () => MINER_A }),
    );
    const indexer = indexerFor(source);
    await stepUntilIdle(indexer);

    source.chain = buildChain({
      length: 30,
      headTime: NOW,
      forkFrom: 28,
      fork: 1,
      minerOf: (n) => (n >= 28 ? MINER_B : MINER_A),
    });
    await stepUntilIdle(indexer);

    expect(allTime(indexer).miners).toEqual([
      { address: MINER_A, blocks: 27 },
      { address: MINER_B, blocks: 2 },
    ]);
  });

  it("rebuilds when the reorg is deeper than MAX_REORG_DEPTH", async () => {
    const length = MAX_REORG_DEPTH + 60;
    const source = new FakeBlockSource(
      buildChain({ length, headTime: NOW, minerOf: () => MINER_A }),
    );
    const indexer = indexerFor(source);
    await stepUntilIdle(indexer);

    source.chain = buildChain({
      length,
      headTime: NOW,
      forkFrom: 10,
      fork: 1,
      minerOf: (n) => (n >= 10 ? MINER_B : MINER_A),
    });
    await stepUntilIdle(indexer);

    expect(allTime(indexer)).toMatchObject({
      totalBlocks: length - 1,
      isComplete: true,
    });
    expect(allTime(indexer).miners[0]).toEqual({
      address: MINER_B,
      blocks: length - 10,
    });
  });

  it("rebuilds when the node head falls far behind the index (chaindata reset)", async () => {
    const source = new FakeBlockSource(
      buildChain({ length: MAX_REORG_DEPTH + 50, headTime: NOW }),
    );
    const indexer = indexerFor(source);
    await stepUntilIdle(indexer);

    source.chain = source.chain.slice(0, 5);
    await stepUntilIdle(indexer);

    expect(indexer.status()).toMatchObject({
      lowestBlock: 0,
      highestBlock: 4,
      phase: ExplorerIndexPhase.SYNCED,
    });
  });

  it("rebuilds when the node runs a different genesis", async () => {
    const source = new FakeBlockSource(
      buildChain({ length: 30, headTime: NOW, minerOf: () => MINER_A }),
    );
    const indexer = indexerFor(source);
    await stepUntilIdle(indexer);

    source.chain = buildChain({
      length: 30,
      headTime: NOW,
      forkFrom: 0,
      fork: 2,
      minerOf: () => MINER_B,
    });
    await stepUntilIdle(indexer);

    expect(allTime(indexer).miners).toEqual([{ address: MINER_B, blocks: 29 }]);
  });

  it("wipes the index on requestRebuild (chaindata quarantined)", async () => {
    const source = new FakeBlockSource(
      buildChain({ length: 30, headTime: NOW }),
    );
    const indexer = indexerFor(source);
    await stepUntilIdle(indexer);

    indexer.requestRebuild("test");
    await indexer.step();

    expect(indexer.status()).toMatchObject({
      lowestBlock: 29,
      highestBlock: 29,
    });
  });

  it("rebuilds a corrupt database file on open", async () => {
    writeFileSync(join(dir, "blocks.sqlite"), "not a database ".repeat(100));

    const indexer = indexerFor(
      new FakeBlockSource(buildChain({ length: 10, headTime: NOW })),
    );
    await stepUntilIdle(indexer);

    expect(indexer.status().phase).toBe(ExplorerIndexPhase.SYNCED);
  });
});

describe("BlockIndexer with an unreachable node", () => {
  it("keeps serving the index and reports the node as unreachable", async () => {
    const source = new FakeBlockSource(
      buildChain({ length: 30, headTime: NOW, minerOf: () => MINER_A }),
    );
    const indexer = indexerFor(source);
    await stepUntilIdle(indexer);
    source.isReachable = false;

    indexer.start();
    await vi.waitFor(() =>
      expect(indexer.status().phase).toBe(ExplorerIndexPhase.NODE_UNREACHABLE),
    );

    expect(allTime(indexer)).toMatchObject({
      totalBlocks: 29,
      miners: [{ address: MINER_A, blocks: 29 }],
    });
  });
});
