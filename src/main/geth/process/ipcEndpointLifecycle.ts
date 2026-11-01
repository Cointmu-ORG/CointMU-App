import { app } from "electron";
import { rm } from "fs/promises";
import {
  getOrCreateInstallId,
  resolveGethIpcEndpoint,
  type GethIpcEndpoint,
} from "./ipcEndpoint";
import { configureGethIpcPath } from "../rpc/rpcUtils";
import type { AppStore } from "../../store/appStore";

let gethIpcEndpoint: GethIpcEndpoint | null = null;

/** @returns The prepared IPC socket path, or null when IPC is disabled. */
export function getGethIpcPath(): string | null {
  return gethIpcEndpoint?.path ?? null;
}

/**
 * Prepares the private geth IPC endpoint. On failure geth starts with IPC
 * disabled, so mining controls fail visibly instead of using an unsafe path.
 * @param {AppStore} store - The electron-store instance holding the install id.
 * @returns {Promise<void>}
 */
export async function prepareGethIpcEndpoint(store: AppStore): Promise<void> {
  try {
    gethIpcEndpoint = await resolveGethIpcEndpoint({
      userDataDir: app.getPath("userData"),
      installId: getOrCreateInstallId(store),
    });
  } catch (err) {
    console.error("[geth:ipc] Could not prepare a private IPC endpoint:", err);
    gethIpcEndpoint = null;
  }
  configureGethIpcPath(gethIpcEndpoint?.path ?? null);
}

/**
 * Removes the short-path IPC directory created when userData was too long.
 * @returns {Promise<void>}
 */
export async function removeTemporaryIpcDir(): Promise<void> {
  const dir = gethIpcEndpoint?.temporaryDir;
  if (!dir) return;
  await rm(dir, { recursive: true, force: true }).catch((err) => {
    console.warn("[geth:ipc] Failed to remove temporary IPC dir:", err);
  });
}
