import { existsSync } from "node:fs";
import { readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import ms from "ms";
import {
  assertSafeRecoveryTarget,
  buildQuarantinePath,
  isQuarantineName,
  resolveChainDataPath,
} from "../utils/recoveryPathGuard";

const RENAME_RETRY_DELAYS_MS = [ms("250ms"), ms("500ms"), ms("1s"), ms("2s")];
const RENAME_RETRYABLE_CODES = new Set(["EBUSY", "EPERM"]);

/**
 * Renames a directory, retrying on the transient EBUSY/EPERM errors Windows
 * raises while an antivirus or indexer still holds a handle inside it.
 * @param from - The current path.
 * @param to - The new path.
 * @throws The last rename error once retries are exhausted or it is not transient.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (const retryDelayMs of [...RENAME_RETRY_DELAYS_MS, null]) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (retryDelayMs === null || !RENAME_RETRYABLE_CODES.has(code)) throw err;
      console.warn(
        `[geth:recovery] Rename ${code}; retrying in ${retryDelayMs}ms`,
      );
      await delay(retryDelayMs);
    }
  }
}

/**
 * Removes every quarantine backup except the one just created, so at most one
 * backup is kept on disk. Each removal passes the keystore guard first.
 * @param dataDir - The absolute geth data directory.
 * @param keepName - The backup directory name to keep.
 * @returns Resolves once stale backups are removed; removal failures are logged.
 */
async function removeOlderBackups(
  dataDir: string,
  keepName: string,
): Promise<void> {
  const gethDir = dirname(resolveChainDataPath(dataDir));
  const staleNames = (await readdir(gethDir)).filter(
    (name) => isQuarantineName(name) && name !== keepName,
  );
  for (const name of staleNames) {
    const target = join(gethDir, name);
    assertSafeRecoveryTarget(dataDir, target);
    try {
      await rm(target, { recursive: true, force: true });
    } catch (err) {
      console.warn(
        `[geth:recovery] Failed to remove old backup ${target}:`,
        err,
      );
    }
  }
}

/**
 * Moves the live chaindata aside as 'chaindata.corrupt-<timestamp>' and keeps
 * only that newest backup. The caller must have observed geth's exit first.
 * @param dataDir - The absolute geth data directory.
 * @returns The backup directory name, or null when there was no chaindata.
 * @throws {RecoveryPathError} When a path falls outside the recovery allow-list.
 */
export async function quarantineChainData(
  dataDir: string,
): Promise<string | null> {
  const chainDataPath = resolveChainDataPath(dataDir);
  if (!existsSync(chainDataPath)) return null;

  const backupPath = buildQuarantinePath(dataDir, Date.now());
  assertSafeRecoveryTarget(dataDir, chainDataPath);
  assertSafeRecoveryTarget(dataDir, backupPath);
  await renameWithRetry(chainDataPath, backupPath);
  console.warn(`[geth:recovery] Quarantined chaindata to ${backupPath}`);

  const backupName = basename(backupPath);
  await removeOlderBackups(dataDir, backupName);
  return backupName;
}
