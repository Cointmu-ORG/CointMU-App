import { constants } from "node:fs";
import {
  access,
  cp,
  lstat,
  mkdir,
  readdir,
  rm,
  statfs,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { ChainDataMoveError } from "../../../bridge/types";
import { PID_FILE_NAME } from "./orphanedGeth";

// Room the copy must leave on the target: geth keeps writing after the move.
const FREE_SPACE_MARGIN_BYTES = 256 * 1024 * 1024;
const PROBE_FILE_NAME = ".cointmu-write-test";

/** Regular files under a folder: what the copy is compared by. */
export interface TreeStats {
  readonly files: number;
  readonly bytes: number;
}

/**
 * @param name - A file name.
 * @returns True for files the copy leaves behind: the PID file of the geth
 *   that wrote this root (it must not follow the data).
 */
function isLeftBehind(name: string): boolean {
  return name === PID_FILE_NAME;
}

/**
 * Counts the regular files and their bytes, as the copy takes them (no
 * sockets, links or PID file).
 * @param dir - The folder.
 * @returns The totals; zeros for a missing folder.
 */
export async function treeStats(dir: string): Promise<TreeStats> {
  let files = 0;
  let bytes = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(
    (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return [];
      throw err;
    },
  );
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await treeStats(path);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile() && !isLeftBehind(entry.name)) {
      files += 1;
      bytes += (await lstat(path)).size;
    }
  }
  return { files, bytes };
}

/**
 * @param path - A path that may not exist yet.
 * @returns The path itself or its closest existing parent.
 */
async function closestExisting(path: string): Promise<string> {
  let current = path;
  while (!(await lstat(current).catch(() => null))) {
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

/**
 * @param from - The current data root.
 * @param to - The folder the user picked.
 * @returns Why `to` cannot take the data, or null when it can: it must be a
 *   different folder, not inside `from`, empty or new, and writable.
 */
export async function checkTarget(
  from: string,
  to: string,
): Promise<ChainDataMoveError | null> {
  const source = resolve(from);
  const target = resolve(to);
  if (source === target) return ChainDataMoveError.SAME_FOLDER;
  const fromSource = relative(source, target);
  if (!fromSource.startsWith("..") && !isAbsolute(fromSource)) {
    return ChainDataMoveError.INSIDE_CURRENT;
  }
  const stat = await lstat(target).catch(() => null);
  if (stat && (!stat.isDirectory() || (await readdir(target)).length > 0)) {
    return ChainDataMoveError.NOT_EMPTY;
  }
  return (await isWritable(target)) ? null : ChainDataMoveError.NOT_WRITABLE;
}

/**
 * @param target - The target folder; may not exist yet.
 * @returns True when a file can be written there (or in the parent that
 *   will hold it).
 */
async function isWritable(target: string): Promise<boolean> {
  const existing = await closestExisting(target);
  try {
    await access(existing, constants.W_OK);
    if (existing !== target) return true;
    const probe = join(target, PROBE_FILE_NAME);
    await writeFile(probe, "");
    await unlink(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param target - The target folder; may not exist yet.
 * @returns Bytes free for this user on the target's file system.
 */
export async function freeBytesAt(target: string): Promise<number> {
  const stats = await statfs(await closestExisting(target));
  return stats.bavail * stats.bsize;
}

/**
 * @param needed - Bytes the copy writes.
 * @returns What the target must have free: the copy plus a margin.
 */
export function requiredFreeBytes(needed: number): number {
  return needed + FREE_SPACE_MARGIN_BYTES;
}

/**
 * Copies the data root, keeping timestamps; skips sockets, FIFOs and the PID
 * file. Fails on any file already present.
 * @param from - The current data root.
 * @param to - The empty or new target.
 */
export async function copyTree(from: string, to: string): Promise<void> {
  // Entry by entry: cp refuses an existing (empty) target folder itself.
  for (const name of await readdir(from)) {
    await cp(join(from, name), join(to, name), {
      recursive: true,
      errorOnExist: true,
      force: false,
      preserveTimestamps: true,
      filter: async (src) => {
        const stat = await lstat(src);
        if (stat.isDirectory()) return true;
        return stat.isFile() && !isLeftBehind(basename(src));
      },
    });
  }
}

/**
 * Removes a failed copy: the whole folder when the move created it,
 * otherwise only what was copied into the (previously empty) folder.
 * @param to - The target.
 * @param didCreate - Whether the move created the folder.
 */
export async function removeCopy(
  to: string,
  didCreate: boolean,
): Promise<void> {
  if (didCreate) {
    await rm(to, { recursive: true, force: true });
    return;
  }
  const entries = await readdir(to).catch(() => []);
  await Promise.all(
    entries.map((name) => rm(join(to, name), { recursive: true, force: true })),
  );
}

/** @param to - Created (with parents) when missing. */
export async function ensureFolder(to: string): Promise<void> {
  await mkdir(to, { recursive: true });
}
