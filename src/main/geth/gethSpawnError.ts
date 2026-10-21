import { NodeBlockReason } from "../../bridge/types";

// macOS errno for "Bad CPU type in executable": an x86_64 binary on Apple
// Silicon without Rosetta 2. libuv has no name for it, so Node only carries
// the negated errno.
const DARWIN_EBADARCH_ERRNO = -86;

/** Spawn failures that retrying cannot fix until the user acts. */
export type SpawnBlockReason =
  | typeof NodeBlockReason.GETH_NOT_FOUND
  | typeof NodeBlockReason.GETH_NOT_EXECUTABLE
  | typeof NodeBlockReason.GETH_WRONG_ARCH;

/** Log text per reason; the renderer shows its own localized hint. */
export const SPAWN_FAILURE_DETAIL: Readonly<Record<SpawnBlockReason, string>> =
  {
    [NodeBlockReason.GETH_NOT_FOUND]: "geth binary not found (ENOENT)",
    [NodeBlockReason.GETH_NOT_EXECUTABLE]:
      "geth binary is not executable (EACCES)",
    [NodeBlockReason.GETH_WRONG_ARCH]:
      "geth binary is built for another CPU (Bad CPU type / ENOEXEC); on Apple Silicon install Rosetta 2",
  };

/**
 * Classifies a geth spawn error that a restart loop cannot fix.
 * @param err - The error from spawn() or the child's 'error' event.
 * @param platform - The OS, since errno numbers differ per platform.
 * @returns The block reason, or null for any other error.
 */
export function classifySpawnError(
  err: unknown,
  platform: NodeJS.Platform,
): SpawnBlockReason | null {
  if (typeof err !== "object" || err === null) return null;
  const code = "code" in err ? err.code : undefined;
  const errno = "errno" in err ? err.errno : undefined;
  if (code === "ENOENT") return NodeBlockReason.GETH_NOT_FOUND;
  if (code === "EACCES") return NodeBlockReason.GETH_NOT_EXECUTABLE;
  if (code === "ENOEXEC") return NodeBlockReason.GETH_WRONG_ARCH;
  if (platform === "darwin" && errno === DARWIN_EBADARCH_ERRNO) {
    return NodeBlockReason.GETH_WRONG_ARCH;
  }
  return null;
}
