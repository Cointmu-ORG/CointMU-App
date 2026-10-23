import {
  NODE_RESTART_DELAY_MS,
  getNodeRecovery,
  killGethProcess,
  spawnGethProcess,
} from "./gethProcess";
import type { AppStore } from "../services/appStore";

/**
 * Restarts geth on a user action (retry, settings change), clearing any
 * blocked or failed recovery state first. Skipped while a recovery owns the
 * node lifecycle.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {boolean} True when the restart was started, false when skipped.
 */
export function restartNodeByUser(store: AppStore): boolean {
  const nodeRecovery = getNodeRecovery();
  if (nodeRecovery && !nodeRecovery.resume()) return false;
  console.log("[network] Restarting node with new configurations...");
  void killGethProcess().then(() => {
    setTimeout(() => {
      void spawnGethProcess(store);
    }, NODE_RESTART_DELAY_MS);
  });
  return true;
}
