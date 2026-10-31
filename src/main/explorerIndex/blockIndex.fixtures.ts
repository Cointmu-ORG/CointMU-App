import { BlockSourceError, type BlockSource } from "./blockSource";
import type { IndexedBlock } from "./blockStore";

export const SECONDS_PER_DAY = 86_400;
export const BLOCK_TIME_SECONDS = 13;
const HASH_HEX_DIGITS = 64;
const ADDRESS_HEX_DIGITS = 40;
const FORK_STRIDE = 1_000_000_000;

/** A deterministic lowercase 0x hash for block `number` on chain `fork`. */
export function hashOf(number: number, fork = 0): string {
  return (
    "0x" +
    (fork * FORK_STRIDE + number + 1)
      .toString(16)
      .padStart(HASH_HEX_DIGITS, "0")
  );
}

/** A lowercase 0x address. */
export function addressOf(id: number): string {
  return "0x" + id.toString(16).padStart(ADDRESS_HEX_DIGITS, "0");
}

export interface ChainOptions {
  readonly length: number;
  /** Timestamp of the last block. */
  readonly headTime: number;
  readonly minerOf?: (number: number) => string;
  /** Blocks from this height on belong to `fork` (a reorged branch). */
  readonly forkFrom?: number;
  readonly fork?: number;
  readonly blockTimeSeconds?: number;
}

/** Builds a linked chain with one block every blockTimeSeconds (default 13) up to headTime. */
export function buildChain(options: ChainOptions): IndexedBlock[] {
  const {
    length,
    headTime,
    forkFrom = Infinity,
    fork = 0,
    blockTimeSeconds = BLOCK_TIME_SECONDS,
  } = options;
  const minerOf = options.minerOf ?? (() => addressOf(1));
  const forkOf = (n: number): number => (n >= forkFrom ? fork : 0);
  return Array.from({ length }, (_, n) => ({
    number: n,
    hash: hashOf(n, forkOf(n)),
    parentHash: n === 0 ? hashOf(-1) : hashOf(n - 1, forkOf(n - 1)),
    timestamp: n === 0 ? 0 : headTime - (length - 1 - n) * blockTimeSeconds,
    miner: minerOf(n),
  }));
}

/** An in-memory node: serves `chain`, which a test may replace (reorg, reset). */
export class FakeBlockSource implements BlockSource {
  chain: IndexedBlock[];
  isReachable = true;
  isSyncing = false;
  blockRequests = 0;

  constructor(chain: IndexedBlock[]) {
    this.chain = chain;
  }

  async chainHead(): Promise<{
    head: number;
    genesisHash: string;
    isSyncing: boolean;
  }> {
    this.assertReachable();
    return {
      head: this.chain.length - 1,
      genesisHash: this.chain[0].hash,
      isSyncing: this.isSyncing,
    };
  }

  async blocks(numbers: readonly number[]): Promise<IndexedBlock[]> {
    this.assertReachable();
    this.blockRequests++;
    return numbers.map((n) => {
      const block = this.chain[n];
      if (block === undefined)
        throw new BlockSourceError(`block ${n} not available`);
      return block;
    });
  }

  private assertReachable(): void {
    if (!this.isReachable) throw new BlockSourceError("node unreachable");
  }
}
