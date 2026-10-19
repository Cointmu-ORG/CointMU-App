import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildUnixSocketPath,
  isUnixSocketPathWithinLimit,
  planIpcEndpoint,
} from "./ipcPath";

const PRIVATE_DIR_MODE = 0o700;
const GROUP_OTHER_PERMISSION_MASK = 0o077;
const SHORT_DIR_PREFIX = "cointmu-";
const INSTALL_ID_STORE_KEY = "geth.ipcInstallId";

/** Raised when the IPC endpoint cannot be placed somewhere private. */
export class IpcEndpointError extends Error {
  constructor(
    message: string,
    readonly target: string,
  ) {
    super(`${message}: ${target}`);
    this.name = "IpcEndpointError";
  }
}

interface InstallIdStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export interface GethIpcEndpoint {
  readonly path: string;
  /** A temporary directory the app created and must remove on quit. */
  readonly temporaryDir: string | null;
}

/**
 * Creates the directory if needed and makes sure only the current user can
 * enter it: a plain directory (not a symlink), owned by us, mode 0700.
 * @param dir - The directory to secure.
 * @throws IpcEndpointError when the directory is a symlink or owned by someone else.
 */
export async function ensurePrivateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  const info = await lstat(dir);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new IpcEndpointError("IPC directory is not a plain directory", dir);
  }
  const currentUid = process.getuid?.();
  if (currentUid !== undefined && info.uid !== currentUid) {
    throw new IpcEndpointError("IPC directory is owned by another user", dir);
  }
  if ((info.mode & GROUP_OTHER_PERMISSION_MASK) !== 0) {
    await chmod(dir, PRIVATE_DIR_MODE);
  }
}

/**
 * Creates a fresh, randomly named 0700 directory under the OS temp dir for
 * when the userData path is too long for a unix socket.
 * @returns The new directory.
 */
export async function createShortPrivateDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), SHORT_DIR_PREFIX));
  await ensurePrivateDir(dir);
  return dir;
}

/**
 * Returns the per-installation id used to name the Windows pipe, creating it
 * on first use.
 * @param store - The electron-store instance.
 * @returns A lowercase UUID.
 */
export function getOrCreateInstallId(store: InstallIdStore): string {
  const existing = store.get(INSTALL_ID_STORE_KEY);
  if (typeof existing === "string" && existing.length > 0) return existing;
  const created = randomUUID();
  store.set(INSTALL_ID_STORE_KEY, created);
  return created;
}

/**
 * Resolves and prepares the private geth IPC endpoint for this platform.
 * @param options - The userData directory and install id.
 * @returns The endpoint path and any temporary directory to clean up.
 * @throws IpcEndpointError when no private location fits the socket limit.
 */
export async function resolveGethIpcEndpoint(options: {
  userDataDir: string;
  installId: string;
}): Promise<GethIpcEndpoint> {
  const plan = planIpcEndpoint({ platform: process.platform, ...options });
  if (plan.kind === "pipe") return { path: plan.path, temporaryDir: null };
  if (plan.kind === "unix") {
    await ensurePrivateDir(plan.dir);
    return { path: plan.path, temporaryDir: null };
  }

  const dir = await createShortPrivateDir();
  const path = buildUnixSocketPath(dir);
  if (!isUnixSocketPathWithinLimit(path, process.platform)) {
    await rm(dir, { recursive: true, force: true });
    throw new IpcEndpointError(
      "No private IPC path fits the socket limit",
      path,
    );
  }
  return { path, temporaryDir: dir };
}
