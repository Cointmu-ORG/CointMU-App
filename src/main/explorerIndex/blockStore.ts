import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

const SCHEMA_VERSION = 1;
const DB_FILE_NAME = "blocks.sqlite";
const SECONDS_PER_DAY = 86_400;
const HEX_PREFIX = "0x";
const GENESIS_HASH_KEY = "genesisHash";
// Two scalar subqueries: SQLite only answers MIN or MAX from the primary key
// when the statement has one of them; "SELECT MIN(x), MAX(x)" scans the table.
export const RANGE_SQL =
  "SELECT (SELECT MIN(number) FROM blocks) AS low, (SELECT MAX(number) FROM blocks) AS high";

/** The block header fields the explorer index keeps. Hashes and miner are lowercase 0x hex. */
export interface IndexedBlock {
  readonly number: number;
  readonly hash: string;
  readonly parentHash: string;
  /** Unix seconds. */
  readonly timestamp: number;
  readonly miner: string;
}

/** A contiguous run of indexed block numbers. */
export interface BlockRange {
  readonly low: number;
  readonly high: number;
}

/** Thrown when the database opens but breaks an index invariant. */
export class BlockStoreInvalidError extends Error {
  override readonly name = "BlockStoreInvalidError";
}

// miner_days is kept by triggers in the same transaction as blocks, so the
// per-day counts can never drift from the rows. Genesis (block 0) is not mined.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS miners (id INTEGER PRIMARY KEY, address TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS blocks (
  number INTEGER PRIMARY KEY,
  hash BLOB NOT NULL,
  parent_hash BLOB NOT NULL,
  timestamp INTEGER NOT NULL,
  miner_id INTEGER NOT NULL REFERENCES miners (id)
);
CREATE TABLE IF NOT EXISTS miner_days (
  day INTEGER NOT NULL,
  miner_id INTEGER NOT NULL,
  blocks INTEGER NOT NULL,
  PRIMARY KEY (day, miner_id)
) WITHOUT ROWID;
CREATE TRIGGER IF NOT EXISTS blocks_count_insert AFTER INSERT ON blocks WHEN NEW.number > 0 BEGIN
  INSERT INTO miner_days VALUES (NEW.timestamp / ${SECONDS_PER_DAY}, NEW.miner_id, 1)
  ON CONFLICT DO UPDATE SET blocks = blocks + 1;
END;
CREATE TRIGGER IF NOT EXISTS blocks_count_delete AFTER DELETE ON blocks WHEN OLD.number > 0 BEGIN
  UPDATE miner_days SET blocks = blocks - 1
  WHERE day = OLD.timestamp / ${SECONDS_PER_DAY} AND miner_id = OLD.miner_id;
END;
`;

const toBytes = (hex: string): Uint8Array =>
  Buffer.from(hex.slice(HEX_PREFIX.length), "hex");
const toHex = (bytes: Uint8Array): string =>
  HEX_PREFIX + Buffer.from(bytes).toString("hex");

/**
 * SQLite storage for the explorer block index (node:sqlite, no native module).
 * Holds one contiguous range of blocks plus per-day block counts per miner.
 * Every method is synchronous and runs on the main thread; each query is a
 * handful of primary-key lookups or a scan of the small per-day table.
 */
export class BlockStore {
  private readonly minerIds = new Map<string, number>();
  private readonly statements: {
    readonly insertBlock: StatementSync;
    readonly insertMiner: StatementSync;
    readonly minerId: StatementSync;
    readonly blockAt: StatementSync;
    readonly countSince: StatementSync;
    readonly countBetween: StatementSync;
    readonly range: StatementSync;
  };

  private constructor(private readonly db: DatabaseSync) {
    this.statements = {
      insertBlock: db.prepare("INSERT INTO blocks VALUES (?, ?, ?, ?, ?)"),
      insertMiner: db.prepare(
        "INSERT INTO miners (address) VALUES (?) ON CONFLICT DO NOTHING",
      ),
      minerId: db.prepare("SELECT id FROM miners WHERE address = ?"),
      blockAt: db.prepare(
        "SELECT number, hash, parent_hash, timestamp FROM blocks WHERE number = ?",
      ),
      countSince: db.prepare(
        `SELECT m.address AS address, SUM(d.blocks) AS blocks FROM miner_days d
         JOIN miners m ON m.id = d.miner_id WHERE d.day > ? GROUP BY d.miner_id`,
      ),
      range: db.prepare(RANGE_SQL),
      countBetween: db.prepare(
        `SELECT m.address AS address, COUNT(*) AS blocks FROM blocks b
         JOIN miners m ON m.id = b.miner_id
         WHERE b.number BETWEEN ? AND ? AND b.number > 0 GROUP BY b.miner_id`,
      ),
    };
  }

  /**
   * Opens (or creates) the index in a directory and checks that the stored
   * blocks form one contiguous range.
   * @param dir - The index directory, created when missing.
   * @returns The open store.
   * @throws {BlockStoreInvalidError} On a schema version mismatch or a gap.
   * @throws The node:sqlite error when the file is not a usable database.
   */
  static open(dir: string): BlockStore {
    mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(join(dir, DB_FILE_NAME));
    try {
      return BlockStore.prepareOpened(db);
    } catch (err) {
      db.close();
      throw err;
    }
  }

  private static prepareOpened(db: DatabaseSync): BlockStore {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    const { user_version: version } = db
      .prepare("PRAGMA user_version")
      .get() as { user_version: number };
    if (version !== 0 && version !== SCHEMA_VERSION) {
      throw new BlockStoreInvalidError(`schema version ${version}`);
    }
    db.exec(SCHEMA_SQL);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    const store = new BlockStore(db);
    store.assertContiguous();
    return store;
  }

  private assertContiguous(): void {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS n, MIN(number) AS low, MAX(number) AS high FROM blocks",
      )
      .get() as { n: number; low: number | null; high: number | null };
    if (
      row.low !== null &&
      row.high !== null &&
      row.n !== row.high - row.low + 1
    ) {
      throw new BlockStoreInvalidError(
        `${row.n} blocks between ${row.low} and ${row.high}`,
      );
    }
  }

  /** Checkpoints the WAL into the database file, then closes it. */
  close(): void {
    try {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      this.db.close();
    }
  }

  /** @returns The indexed range, or null when the index is empty. */
  range(): BlockRange | null {
    const row = this.statements.range.get() as {
      low: number | null;
      high: number | null;
    };
    return row.low === null || row.high === null
      ? null
      : { low: row.low, high: row.high };
  }

  /** @returns The block hash, parent hash and timestamp at a height, or null when not indexed. */
  blockAt(
    number: number,
  ): { hash: string; parentHash: string; timestamp: number } | null {
    const row = this.statements.blockAt.get(number) as
      | { hash: Uint8Array; parent_hash: Uint8Array; timestamp: number }
      | undefined;
    if (row === undefined) return null;
    return {
      hash: toHex(row.hash),
      parentHash: toHex(row.parent_hash),
      timestamp: row.timestamp,
    };
  }

  /** @returns The genesis hash the index was built against, or null for a new index. */
  genesisHash(): string | null {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(GENESIS_HASH_KEY) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setGenesisHash(hash: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)")
      .run(GENESIS_HASH_KEY, hash);
  }

  /**
   * Inserts blocks in one transaction; the caller keeps the range contiguous.
   * @param blocks - The blocks to add.
   */
  insert(blocks: readonly IndexedBlock[]): void {
    this.inTransaction(() => {
      for (const block of blocks) {
        this.statements.insertBlock.run(
          block.number,
          toBytes(block.hash),
          toBytes(block.parentHash),
          block.timestamp,
          this.minerIdOf(block.miner),
        );
      }
    });
  }

  /**
   * Rewrites the database densely. The backfill inserts below the lowest
   * block, which leaves B-tree pages about half full (~160 instead of ~80
   * bytes per block); one VACUUM after the backfill halves the file.
   */
  compact(): void {
    this.db.exec("VACUUM; PRAGMA wal_checkpoint(TRUNCATE);");
  }

  /** Removes every block above a height (reorg rollback). */
  deleteAbove(number: number): void {
    this.inTransaction(() => {
      this.db.prepare("DELETE FROM blocks WHERE number > ?").run(number);
      this.db.exec("DELETE FROM miner_days WHERE blocks <= 0");
    });
  }

  /**
   * Counts mined blocks per miner with a timestamp at or after `since`, from
   * the per-day counts plus the blocks of the first, partial day.
   * @param since - Unix seconds; 0 for all time.
   * @returns Blocks per lowercase miner address, genesis excluded.
   */
  countByMiner(since: number): Map<string, number> {
    const counts = new Map<string, number>();
    const range = this.range();
    if (range === null) return counts;
    const sinceDay = Math.floor(since / SECONDS_PER_DAY);
    const add = (rows: unknown[]): void => {
      for (const row of rows as { address: string; blocks: number }[]) {
        counts.set(row.address, (counts.get(row.address) ?? 0) + row.blocks);
      }
    };
    add(this.statements.countSince.all(sinceDay));
    const first = this.firstAtOrAfter(since, range);
    const nextDay = this.firstAtOrAfter(
      (sinceDay + 1) * SECONDS_PER_DAY,
      range,
    );
    if (first < nextDay)
      add(this.statements.countBetween.all(first, nextDay - 1));
    return counts;
  }

  /**
   * Binary search for the first indexed block at or after a time. Valid because
   * consensus requires each block's timestamp to exceed its parent's.
   * @returns That block number, or range.high + 1 when every block is older.
   */
  private firstAtOrAfter(timestamp: number, range: BlockRange): number {
    let low = range.low;
    let high = range.high + 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const block = this.blockAt(mid);
      if (block !== null && block.timestamp >= timestamp) high = mid;
      else low = mid + 1;
    }
    return low;
  }

  private minerIdOf(address: string): number {
    const cached = this.minerIds.get(address);
    if (cached !== undefined) return cached;
    this.statements.insertMiner.run(address);
    const { id } = this.statements.minerId.get(address) as { id: number };
    this.minerIds.set(address, id);
    return id;
  }

  private inTransaction(work: () => void): void {
    this.db.exec("BEGIN");
    try {
      work();
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      // A rolled-back miner insert would leave a dangling cached id.
      this.minerIds.clear();
      throw err;
    }
  }
}
