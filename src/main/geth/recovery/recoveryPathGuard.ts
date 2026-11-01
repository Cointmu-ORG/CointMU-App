import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

const GETH_SUBDIR = "geth";
const KEYSTORE_SUBDIR = "keystore";
const CHAINDATA_DIR_NAME = "chaindata";
const QUARANTINE_PREFIX = `${CHAINDATA_DIR_NAME}.corrupt-`;
const RECOVERY_TARGET_NAME_PATTERN = /^chaindata(?:\.corrupt-\d+)?$/;
const QUARANTINE_NAME_PATTERN = /^chaindata\.corrupt-\d+$/;

/**
 * Raised when a recovery filesystem operation targets a path outside the
 * chaindata allow-list. Recovery must abort rather than touch that path.
 */
export class RecoveryPathError extends Error {
  constructor(
    message: string,
    readonly target: string,
  ) {
    super(`${message}: ${target}`);
    this.name = "RecoveryPathError";
  }
}

/**
 * Reports whether a path equals or lies inside a parent directory. Relies on
 * path.relative so Windows drive-letter casing is compared case-insensitively.
 * @param parent - The absolute parent directory.
 * @param child - The absolute path to test.
 * @returns True when child is parent itself or a descendant of it.
 */
function isSameOrInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  if (rel === "") return true;
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * Resolves the live chaindata directory for a geth data directory.
 * @param dataDir - The absolute geth data directory.
 * @returns The absolute '<dataDir>/geth/chaindata' path.
 */
export function resolveChainDataPath(dataDir: string): string {
  return join(dataDir, GETH_SUBDIR, CHAINDATA_DIR_NAME);
}

/**
 * Builds the quarantine path a corrupted chaindata directory is renamed to.
 * @param dataDir - The absolute geth data directory.
 * @param timestampMs - The quarantine time, used as the unique suffix.
 * @returns The absolute '<dataDir>/geth/chaindata.corrupt-<timestampMs>' path.
 */
export function buildQuarantinePath(
  dataDir: string,
  timestampMs: number,
): string {
  return join(dataDir, GETH_SUBDIR, `${QUARANTINE_PREFIX}${timestampMs}`);
}

/**
 * Reports whether a directory entry name is a chaindata quarantine backup.
 * @param name - A bare directory entry name.
 * @returns True for 'chaindata.corrupt-<digits>'.
 */
export function isQuarantineName(name: string): boolean {
  return QUARANTINE_NAME_PATTERN.test(name);
}

/**
 * Guards every rename/remove performed by chaindata recovery. The target must
 * be the chaindata directory or one of its quarantine backups directly under
 * '<dataDir>/geth', and must neither be, contain, nor sit inside the keystore.
 * @param dataDir - The absolute geth data directory.
 * @param target - The path recovery is about to rename or remove.
 * @throws {RecoveryPathError} When the target is outside the allow-list.
 */
export function assertSafeRecoveryTarget(
  dataDir: string,
  target: string,
): void {
  const resolvedTarget = resolve(target);
  const keystorePath = resolve(dataDir, KEYSTORE_SUBDIR);

  if (
    isSameOrInside(keystorePath, resolvedTarget) ||
    isSameOrInside(resolvedTarget, keystorePath)
  ) {
    throw new RecoveryPathError(
      "Recovery refused to touch the keystore",
      resolvedTarget,
    );
  }
  if (relative(resolve(dataDir, GETH_SUBDIR), dirname(resolvedTarget)) !== "") {
    throw new RecoveryPathError(
      "Recovery target is outside the geth directory",
      resolvedTarget,
    );
  }
  if (!RECOVERY_TARGET_NAME_PATTERN.test(basename(resolvedTarget))) {
    throw new RecoveryPathError(
      "Recovery target is not a chaindata directory",
      resolvedTarget,
    );
  }
}
