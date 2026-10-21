import { NodeBlockReason } from "../../bridge/types";
import { initGethIfNeeded } from "./gethInit";
import { getNodeRecovery, spawnGethProcess } from "./gethProcess";
import {
  SPAWN_FAILURE_DETAIL,
  classifySpawnError,
  type SpawnBlockReason,
} from "./gethSpawnError";
import { resolveDataDir } from "./networkConfig";
import type { AppStore } from "../services/appStore";

/**
 * Classifies an init error only when spawning the init geth failed: the datadir
 * mkdir/writeFile errors share codes like EACCES but say nothing about geth.
 * @param {unknown} err - The error initGethIfNeeded rejected with.
 * @returns The spawn block reason, or null for any other init failure.
 */
function classifyInitError(err: unknown): SpawnBlockReason | null {
  const isSpawnError =
    err instanceof Error &&
    "syscall" in err &&
    typeof err.syscall === "string" &&
    err.syscall.startsWith("spawn");
  return isSpawnError ? classifySpawnError(err, process.platform) : null;
}

/**
 * Inits genesis when the datadir has none, then spawns geth. When init fails,
 * geth is not spawned: it would fill the empty datadir with its default
 * mainnet genesis. Restarts are blocked with the init failure instead; a geth
 * that cannot even start (missing, not executable, wrong CPU) gets its own hint.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {Promise<boolean>} False when init failed and geth was not spawned.
 */
export async function initAndSpawnGeth(store: AppStore): Promise<boolean> {
  try {
    await initGethIfNeeded(resolveDataDir());
  } catch (err) {
    const spawnReason = classifyInitError(err);
    console.error(
      `[geth:init] Genesis init failed; not starting geth: ${spawnReason ? SPAWN_FAILURE_DETAIL[spawnReason] : "see error"}`,
      err,
    );
    getNodeRecovery()?.handleStartFailure(
      spawnReason ?? NodeBlockReason.GENESIS_INIT_FAILED,
    );
    return false;
  }
  await spawnGethProcess(store);
  return true;
}
