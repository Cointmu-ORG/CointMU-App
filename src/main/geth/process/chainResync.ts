import {
  ChainResyncError,
  type ChainResyncResult,
} from "../../../bridge/types";
import { quarantineChainData } from "../recovery/chaindataQuarantine";
import { isChainDataMoveInProgress } from "./chainDataMove";
import { isStartupInProgress } from "./nodeStartup";

/** What a resync needs from the app; tests pass fakes. */
export interface ChainResyncDeps {
  readonly resolveDataDir: () => string;
  /** The local head before the resync, or null when geth did not answer. */
  readonly readHeadBlock: () => Promise<number | null>;
  /** Stops geth and the explorer index worker. */
  readonly stopNode: () => Promise<void>;
  readonly hasGethExited: () => boolean;
  readonly setTokenScanPaused: (isPaused: boolean) => void;
  readonly initGenesis: (dataDir: string) => Promise<void>;
  readonly startNode: () => Promise<void>;
  readonly requestIndexRebuild: (reason: string) => void;
  /** Persists the head the backup reached; null once there is no backup. */
  readonly saveBackupHead: (headBlock: number | null) => void;
}

let isResyncing = false;

/** @returns True while a resync runs; restarts and the stall watchdog wait. */
export function isResyncInProgress(): boolean {
  return isResyncing;
}

/**
 * Re-downloads the chain from genesis: stops geth, the index worker and the
 * token scanner, moves <datadir>/geth/chaindata into quarantine (the #99
 * backup, keystore-guarded), re-inits genesis and starts geth again. The
 * explorer index is rebuilt; the token scanner rewinds on the lower head.
 * The datadir follows the current data root (#126), so the PID file (#83)
 * and the geth binary copy are untouched.
 * @param deps - The node lifecycle.
 * @returns The outcome; geth is started again whatever happened.
 */
export async function resyncFromGenesis(
  deps: ChainResyncDeps,
): Promise<ChainResyncResult> {
  if (isStartupInProgress()) {
    return { ok: false, error: ChainResyncError.NODE_STARTING };
  }
  if (isResyncing || isChainDataMoveInProgress()) {
    return { ok: false, error: ChainResyncError.BUSY };
  }
  isResyncing = true;
  deps.setTokenScanPaused(true);
  try {
    const headBlock = await deps.readHeadBlock();
    await deps.stopNode();
    if (!deps.hasGethExited()) {
      return { ok: false, error: ChainResyncError.NODE_STILL_RUNNING };
    }
    const dataDir = deps.resolveDataDir();
    const backupName = await quarantineChainData(dataDir);
    // Without a known head the backup waits for "Delete backup".
    deps.saveBackupHead(backupName && headBlock !== null ? headBlock : null);
    deps.requestIndexRebuild("chain resynced from genesis");
    await deps.initGenesis(dataDir);
    return { ok: true };
  } catch (err) {
    console.error("[resync] Resync from genesis failed:", err);
    return { ok: false, error: ChainResyncError.FAILED };
  } finally {
    try {
      await deps.startNode();
    } catch (err) {
      console.error("[resync] Could not start geth after the resync:", err);
    }
    deps.setTokenScanPaused(false);
    isResyncing = false;
  }
}

/** What the backup cleanup needs; tests pass fakes. */
export interface BackupCleanupDeps {
  readonly readHeadBlock: () => Promise<number | null>;
  readonly readBackupHead: () => number | null;
  readonly saveBackupHead: (headBlock: number | null) => void;
  readonly removeBackups: () => Promise<void>;
}

/**
 * Deletes the resync backup once the new chain has passed the block the old
 * one had reached, so the backup is no longer needed.
 * @param deps - Head reader, stored mark and the removal.
 * @returns True when the backup was removed.
 */
export async function dropBackupWhenCaughtUp(
  deps: BackupCleanupDeps,
): Promise<boolean> {
  const backupHead = deps.readBackupHead();
  if (backupHead === null || isResyncing) return false;
  const head = await deps.readHeadBlock();
  if (head === null || head < backupHead) return false;
  await deps.removeBackups();
  deps.saveBackupHead(null);
  console.warn(`[resync] Passed block ${backupHead}; backup removed`);
  return true;
}
