import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ChainDataMoveError,
  ChainDataMovePhase,
  type ChainDataMoveResult,
} from "../../../bridge/types";
import {
  checkTarget,
  copyTree,
  ensureFolder,
  freeBytesAt,
  removeCopy,
  requiredFreeBytes,
  treeStats,
} from "./chainDataCopy";

/** What a move needs from the app; tests pass fakes. */
export interface ChainDataMoveDeps {
  readonly currentRoot: () => string;
  /** Stops geth and the explorer index worker; resolves once both are down. */
  readonly stopNode: () => Promise<void>;
  /** Starts geth (and the index worker) on the current data root. */
  readonly startNode: () => Promise<void>;
  /** Persists the new root and points geth at it. */
  readonly saveRoot: (root: string) => void;
  readonly onPhase?: (phase: ChainDataMovePhase) => void;
  readonly copy?: (from: string, to: string) => Promise<void>;
  readonly freeBytes?: (target: string) => Promise<number>;
}

/** A failure carrying the code shown to the user. */
class MoveFailure extends Error {
  constructor(readonly code: ChainDataMoveError) {
    super(code);
  }
}

let isMoving = false;

/** @returns True while a move runs; node restarts wait for it. */
export function isChainDataMoveInProgress(): boolean {
  return isMoving;
}

/**
 * Checks a target before asking the user to confirm the move.
 * @param from - The current data root.
 * @param to - The picked folder.
 * @param freeBytes - Free space on the target.
 * @returns The problem, or the bytes the target needs free.
 */
export async function assessTarget(
  from: string,
  to: string,
  freeBytes: (target: string) => Promise<number> = freeBytesAt,
): Promise<{ error: ChainDataMoveError } | { requiredBytes: number }> {
  const problem = await checkTarget(from, to);
  if (problem) return { error: problem };
  const requiredBytes = requiredFreeBytes((await treeStats(from)).bytes);
  if ((await freeBytes(to)) < requiredBytes) {
    return { error: ChainDataMoveError.NOT_ENOUGH_SPACE };
  }
  return { requiredBytes };
}

async function copyAndVerify(
  from: string,
  to: string,
  deps: ChainDataMoveDeps,
): Promise<void> {
  const expected = await treeStats(from);
  deps.onPhase?.(ChainDataMovePhase.COPYING);
  try {
    await (deps.copy ?? copyTree)(from, to);
  } catch (err) {
    console.error(`[chaindata] Copy from ${from} to ${to} failed:`, err);
    throw new MoveFailure(ChainDataMoveError.COPY_FAILED);
  }
  deps.onPhase?.(ChainDataMovePhase.VERIFYING);
  const copied = await treeStats(to);
  if (copied.files !== expected.files || copied.bytes !== expected.bytes) {
    console.error(
      `[chaindata] Copy differs: ${copied.files} files/${copied.bytes} B, expected ${expected.files}/${expected.bytes}`,
    );
    throw new MoveFailure(ChainDataMoveError.VERIFY_FAILED);
  }
}

/**
 * Moves the chain data to `target`: stops geth and the index worker, checks
 * the target and its free space, copies, compares file count and bytes,
 * saves the new root, and starts geth there. Any failure removes the copy
 * and starts geth on the old root again; the old data is never touched.
 * @param target - An empty or new folder.
 * @param deps - App hooks.
 * @returns The old root to offer for deletion, or the reason it failed.
 */
export async function moveChainData(
  target: string,
  deps: ChainDataMoveDeps,
): Promise<ChainDataMoveResult> {
  if (isMoving) return { ok: false, error: ChainDataMoveError.BUSY };
  const from = deps.currentRoot();
  const to = resolve(target);
  const assessed = await assessTarget(from, to, deps.freeBytes);
  if ("error" in assessed) return { ok: false, error: assessed.error };

  isMoving = true;
  const didCreate = !existsSync(to);
  try {
    deps.onPhase?.(ChainDataMovePhase.STOPPING);
    await deps.stopNode();
    await ensureFolder(to);
    await copyAndVerify(from, to, deps);
    deps.saveRoot(to);
    return { ok: true, oldRoot: from };
  } catch (err) {
    await removeCopy(to, didCreate);
    if (err instanceof MoveFailure) return { ok: false, error: err.code };
    console.error(`[chaindata] Move to ${to} failed:`, err);
    return { ok: false, error: ChainDataMoveError.COPY_FAILED };
  } finally {
    deps.onPhase?.(ChainDataMovePhase.STARTING);
    await deps.startNode();
    isMoving = false;
  }
}

/**
 * Deletes the data left at the old root after a move.
 * @param oldRoot - The root the last move came from.
 * @param currentRoot - The root geth uses now; never deleted.
 */
export async function deleteOldChainData(
  oldRoot: string,
  currentRoot: string,
): Promise<void> {
  if (resolve(oldRoot) === resolve(currentRoot)) {
    throw new Error(`Refusing to delete the chain data in use: ${oldRoot}`);
  }
  await rm(oldRoot, { recursive: true, force: true });
}

/**
 * Decides the data root at startup from the stored setting.
 * @param stored - The saved root; "" for the default.
 * @param exists - Checks a folder.
 * @returns The root to use, or null for the default. A saved root that is
 *   gone (an unplugged drive) falls back to the default instead of letting
 *   geth create an empty chain at the missing path.
 */
export function storedDataRoot(
  stored: unknown,
  exists: (path: string) => boolean = existsSync,
): string | null {
  if (typeof stored !== "string" || stored === "") return null;
  if (exists(stored)) return stored;
  console.error(
    `[chaindata] Saved chain data folder ${stored} is missing; using the default`,
  );
  return null;
}
