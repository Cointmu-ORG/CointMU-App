import type { AppStore } from "../../store/appStore";
import { applyGethPriority } from "./gethPriority";

const LOW_PRIORITY_KEY = "mining.lowPriority";
// Threads geth starts meanwhile, and geth.exe under the Windows supervisor,
// exist only a moment after the spawn.
const REAPPLY_DELAY_MS = 10_000;

let currentPid: number | null = null;

const isLowPriority = (store: AppStore): boolean =>
  store.get(LOW_PRIORITY_KEY) === true;

/**
 * Lowers a newly spawned geth's priority when the setting is on (a new
 * process starts at normal, so off needs nothing).
 * @param store - The settings store.
 * @param pid - The PID geth was spawned as.
 */
export function applyPriorityOnSpawn(store: AppStore, pid: number): void {
  currentPid = pid;
  if (!isLowPriority(store)) return;
  const apply = (): void => {
    if (currentPid !== pid || !isLowPriority(store)) return;
    void applyGethPriority(pid, true);
  };
  apply();
  setTimeout(apply, REAPPLY_DELAY_MS).unref();
}

/**
 * Applies a change of the setting to the running geth without a restart;
 * only raising it back on Linux/macOS, which needs privileges, restarts geth.
 * @param store - The settings store.
 * @param restartNode - Restarts geth (the user's restart path).
 */
export function watchGethPriority(
  store: AppStore,
  restartNode: () => void,
): void {
  store.onDidChange(LOW_PRIORITY_KEY, async () => {
    if (currentPid === null) return;
    const result = await applyGethPriority(currentPid, isLowPriority(store));
    if (result === "needs-restart") {
      console.log("[geth:priority] Restarting geth to restore normal priority");
      restartNode();
    }
  });
}
