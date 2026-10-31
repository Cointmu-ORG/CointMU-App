import { rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import ms from "ms";
import {
  ExplorerIndexPhase,
  type ExplorerIndexStatus,
  type MinerDistributionResult,
  type MinerRange,
} from "../../bridge/types";
import { BlockSourceError, type BlockSource } from "./blockSource";
import { BlockStore, type BlockRange, type IndexedBlock } from "./blockStore";
import { buildMinerDistribution } from "./minerDistribution";

/** Blocks per RPC batch: one HTTP request per step. */
export const BATCH_BLOCKS = 100;
/** A reorg deeper than this, or a node head this far below the index, rebuilds the index. */
export const MAX_REORG_DEPTH = 128;
const REORG_CHUNK_BLOCKS = 32;
const BUSY_PAUSE_MS = ms("100ms");
// While geth imports blocks the index yields: one batch per second at most.
const SYNCING_PAUSE_MS = ms("1s");
const FOLLOW_INTERVAL_MS = ms("5s");
const ERROR_BACKOFF_MS = ms("10s");
const PERCENT = 100;

/** Whether a step did work (step again soon) or found nothing to do. */
export const StepOutcome = { BUSY: "busy", IDLE: "idle" } as const;
export type StepOutcome = (typeof StepOutcome)[keyof typeof StepOutcome];

const numbersBetween = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** @returns True when every block's parentHash is the previous block's hash. */
function isChain(blocks: readonly IndexedBlock[]): boolean {
  return blocks.every(
    (block, i) => i === 0 || block.parentHash === blocks[i - 1].hash,
  );
}

/**
 * Opens the index, or wipes and recreates it when it is unreadable.
 * @param dir - The index directory.
 * @returns The open store.
 */
function openOrRecreate(dir: string): BlockStore {
  try {
    return BlockStore.open(dir);
  } catch (err) {
    console.warn("[explorer-index] Index unreadable; rebuilding:", err);
    return recreate(dir);
  }
}

function recreate(dir: string): BlockStore {
  rmSync(dir, { recursive: true, force: true });
  return BlockStore.open(dir);
}

/**
 * Keeps a local index of block headers in step with the node. The index is
 * one contiguous range: it starts at the node head, follows new blocks, and
 * backfills toward genesis in the background, so recent ranges fill first.
 * The range survives restarts, so backfill resumes where it stopped. A reorg
 * rolls the tip back to the common block; a changed genesis, a deeper reorg,
 * a broken link or an unreadable database rebuilds the index from scratch.
 */
export class BlockIndexer {
  private store: BlockStore;
  private nodeHead: number | null = null;
  private isNodeReachable = true;
  private isNodeSyncing = false;
  private isRebuildRequested = false;
  private readonly stopController = new AbortController();
  private loop: Promise<void> | null = null;

  constructor(
    private readonly dir: string,
    private readonly source: BlockSource,
  ) {
    this.store = openOrRecreate(dir);
  }

  /** Starts the background loop; a second call is a no-op. */
  start(): void {
    this.loop ??= this.run();
  }

  /** Stops the loop, aborting any request in flight, and closes the database. */
  async stop(): Promise<void> {
    this.stopController.abort();
    await this.loop;
    this.store.close();
  }

  /** Wipes the index before the next step, e.g. after chaindata was quarantined. */
  requestRebuild(reason: string): void {
    console.warn(`[explorer-index] Rebuild requested: ${reason}`);
    this.isRebuildRequested = true;
  }

  status(): ExplorerIndexStatus {
    const range = this.store.range();
    const head = this.nodeHead;
    const isSynced =
      range !== null && head !== null && range.low === 0 && range.high >= head;
    let phase: ExplorerIndexPhase = ExplorerIndexPhase.INDEXING;
    if (!this.isNodeReachable) phase = ExplorerIndexPhase.NODE_UNREACHABLE;
    else if (isSynced) phase = ExplorerIndexPhase.SYNCED;
    const indexed = range === null ? 0 : range.high - range.low + 1;
    return {
      phase,
      lowestBlock: range?.low ?? null,
      highestBlock: range?.high ?? null,
      nodeHead: head,
      percent:
        head === null ? 0 : Math.min(PERCENT, (indexed / (head + 1)) * PERCENT),
    };
  }

  /**
   * @param range - The time window.
   * @param nowSeconds - The current Unix time.
   * @returns The miner distribution from the index, with its coverage.
   */
  minerDistribution(
    range: MinerRange,
    nowSeconds: number,
  ): MinerDistributionResult {
    return buildMinerDistribution(this.store, this.status(), range, nowSeconds);
  }

  /** One indexing step; the background loop calls it repeatedly. */
  async step(): Promise<StepOutcome> {
    if (this.isRebuildRequested) this.rebuild("requested");
    const chain = await this.source.chainHead(this.stopController.signal);
    this.nodeHead = chain.head;
    this.isNodeSyncing = chain.isSyncing;
    const knownGenesis = this.store.genesisHash();
    if (knownGenesis !== null && knownGenesis !== chain.genesisHash) {
      this.rebuild("the node has a different genesis");
    }
    if (knownGenesis !== chain.genesisHash) {
      this.store.setGenesisHash(chain.genesisHash);
    }

    const range = this.store.range();
    if (range === null) return this.seed(chain.head);
    if (range.high > chain.head) return this.rewind(chain.head, range);
    if (range.high < chain.head) return this.followTip(range, chain.head);
    const [tip] = await this.fetch([range.high]);
    if (tip.hash !== this.store.blockAt(range.high)?.hash) {
      return this.rewind(range.high, range);
    }
    if (range.low > 0) return this.backfill(range);
    return StepOutcome.IDLE;
  }

  private async run(): Promise<void> {
    while (!this.stopController.signal.aborted) {
      const pauseMs = await this.stepSafely();
      try {
        await delay(pauseMs, undefined, { signal: this.stopController.signal });
      } catch {
        return;
      }
    }
  }

  /** @returns How long to wait before the next step. */
  private async stepSafely(): Promise<number> {
    try {
      const outcome = await this.step();
      this.isNodeReachable = true;
      if (outcome === StepOutcome.IDLE) return FOLLOW_INTERVAL_MS;
      return this.isNodeSyncing ? SYNCING_PAUSE_MS : BUSY_PAUSE_MS;
    } catch (err) {
      if (this.stopController.signal.aborted) return 0;
      if (err instanceof BlockSourceError) {
        this.isNodeReachable = false;
        return ERROR_BACKOFF_MS;
      }
      console.error("[explorer-index] Index failed; rebuilding:", err);
      this.isRebuildRequested = true;
      return ERROR_BACKOFF_MS;
    }
  }

  private fetch(numbers: readonly number[]): Promise<IndexedBlock[]> {
    return this.source.blocks(numbers, this.stopController.signal);
  }

  /** Starts an empty index at the node head. */
  private async seed(head: number): Promise<StepOutcome> {
    this.store.insert(await this.fetch([head]));
    return StepOutcome.BUSY;
  }

  private async followTip(
    range: BlockRange,
    head: number,
  ): Promise<StepOutcome> {
    const blocks = await this.fetch(
      numbersBetween(range.high + 1, Math.min(head, range.high + BATCH_BLOCKS)),
    );
    const tipHash = this.store.blockAt(range.high)?.hash;
    if (blocks[0].parentHash !== tipHash) return this.rewind(range.high, range);
    if (isChain(blocks)) this.store.insert(blocks);
    return StepOutcome.BUSY;
  }

  private async backfill(range: BlockRange): Promise<StepOutcome> {
    const blocks = await this.fetch(
      numbersBetween(Math.max(0, range.low - BATCH_BLOCKS), range.low - 1),
    );
    const lowest = this.store.blockAt(range.low);
    if (!isChain(blocks) || blocks.at(-1)?.hash !== lowest?.parentHash) {
      this.rebuild(`block ${range.low - 1} does not link to the index`);
      return StepOutcome.BUSY;
    }
    this.store.insert(blocks);
    // ponytail: blocks the main thread once per (re)build, ~0.5 s per 300k
    // blocks; move the store to a worker thread if that pause shows.
    if (blocks[0].number === 0) this.store.compact();
    return StepOutcome.BUSY;
  }

  /**
   * Walks back from `start` to the highest block whose hash the node still
   * has, and drops everything above it. Rebuilds when that block is more than
   * MAX_REORG_DEPTH below the indexed tip, or outside the index.
   */
  private async rewind(start: number, range: BlockRange): Promise<StepOutcome> {
    const floor = Math.max(range.low, range.high - MAX_REORG_DEPTH);
    for (let top = start; top >= floor; top -= REORG_CHUNK_BLOCKS) {
      const nodeBlocks = await this.fetch(
        numbersBetween(Math.max(floor, top - REORG_CHUNK_BLOCKS + 1), top),
      );
      const common = nodeBlocks.findLast(
        (block) => block.hash === this.store.blockAt(block.number)?.hash,
      );
      if (common !== undefined) {
        this.store.deleteAbove(common.number);
        return StepOutcome.BUSY;
      }
    }
    this.rebuild(
      `no common block with the node from ${start} down to ${floor}`,
    );
    return StepOutcome.BUSY;
  }

  private rebuild(reason: string): void {
    console.warn(`[explorer-index] Rebuilding the index: ${reason}`);
    this.store.close();
    this.store = recreate(this.dir);
    this.isRebuildRequested = false;
  }
}
