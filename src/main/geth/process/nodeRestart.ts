import {
  NODE_RESTART_DELAY_MS,
  getNodeRecovery,
  killGethProcess,
  spawnGethProcess,
} from "./gethProcess";
import type { AppStore } from "../../store/appStore";

let isRestarting = false;

async function restartNode(store: AppStore): Promise<void> {
  await killGethProcess();
  await new Promise((resolve) => setTimeout(resolve, NODE_RESTART_DELAY_MS));
  await spawnGethProcess(store);
}

/**
 * Restarts geth on a user action (retry, settings change), clearing any
 * blocked or failed recovery state first. Skipped while a recovery owns the
 * node lifecycle. A call while a restart is under way joins it instead of
 * spawning a second geth on the same datadir.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {boolean} True when a restart was started or joined, false when skipped.
 */
export function restartNodeByUser(store: AppStore): boolean {
  const nodeRecovery = getNodeRecovery();
  if (nodeRecovery && !nodeRecovery.resume()) return false;
  // ponytail: the joined change is picked up because spawn reads the store after
  // the kill; one saved in the few ms after that read waits for the next restart.
  // Queue a follow-up restart if that ever shows up.
  if (isRestarting) return true;
  isRestarting = true;
  console.log("[network] Restarting node with new configurations...");
  void restartNode(store)
    .catch((err: unknown) => {
      console.error("[network] Node restart failed:", err);
    })
    .finally(() => {
      isRestarting = false;
    });
  return true;
}
