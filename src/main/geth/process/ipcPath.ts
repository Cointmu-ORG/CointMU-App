import { join } from "node:path";

/**
 * Pure path rules for the private geth IPC endpoint. Anything that can reach
 * this endpoint controls the node (admin, miner), so it must live where only
 * the current user can open it.
 */

const SOCKET_FILE_NAME = "geth.ipc";
const IPC_DIR_NAME = "ipc";
const WINDOWS_PIPE_PREFIX = "\\\\.\\pipe\\";
const PIPE_NAME_PREFIX = "cointmu-geth-";
const INSTALL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// sun_path holds 108 bytes on Linux and 104 on macOS, including the NUL.
const UNIX_SOCKET_PATH_MAX_BYTES: Partial<Record<NodeJS.Platform, number>> = {
  linux: 107,
  darwin: 103,
};
const FALLBACK_UNIX_SOCKET_PATH_MAX_BYTES = 103;

export type IpcEndpointPlan =
  | { readonly kind: "pipe"; readonly path: string }
  | { readonly kind: "unix"; readonly dir: string; readonly path: string }
  | { readonly kind: "unix-too-long"; readonly path: string };

/**
 * @param installId - The per-installation UUID.
 * @returns The Windows named pipe path unique to this installation.
 * @throws Error when installId is not a lowercase UUID.
 */
export function buildWindowsPipePath(installId: string): string {
  if (!INSTALL_ID_PATTERN.test(installId)) {
    throw new Error(`Invalid geth IPC install id: ${installId}`);
  }
  return `${WINDOWS_PIPE_PREFIX}${PIPE_NAME_PREFIX}${installId}`;
}

/**
 * @param dir - A private directory.
 * @returns The geth socket path inside it.
 */
export function buildUnixSocketPath(dir: string): string {
  return join(dir, SOCKET_FILE_NAME);
}

/**
 * @param userDataDir - The Electron userData directory.
 * @returns The preferred private IPC directory under userData.
 */
export function resolvePreferredIpcDir(userDataDir: string): string {
  return join(userDataDir, IPC_DIR_NAME);
}

/**
 * @param socketPath - A unix socket path.
 * @param platform - The target platform.
 * @returns True when the path fits the platform's sun_path limit.
 */
export function isUnixSocketPathWithinLimit(
  socketPath: string,
  platform: NodeJS.Platform,
): boolean {
  const maxBytes =
    UNIX_SOCKET_PATH_MAX_BYTES[platform] ?? FALLBACK_UNIX_SOCKET_PATH_MAX_BYTES;
  return Buffer.byteLength(socketPath, "utf8") <= maxBytes;
}

/**
 * Chooses the IPC endpoint for a platform without touching the filesystem.
 * @param options - The platform, userData directory and install id.
 * @returns A named pipe, a socket in the userData IPC dir, or a signal that
 * the userData path is too long and a short private dir is needed.
 */
export function planIpcEndpoint(options: {
  platform: NodeJS.Platform;
  userDataDir: string;
  installId: string;
}): IpcEndpointPlan {
  if (options.platform === "win32") {
    return { kind: "pipe", path: buildWindowsPipePath(options.installId) };
  }
  const dir = resolvePreferredIpcDir(options.userDataDir);
  const path = buildUnixSocketPath(dir);
  return isUnixSocketPathWithinLimit(path, options.platform)
    ? { kind: "unix", dir, path }
    : { kind: "unix-too-long", path };
}
