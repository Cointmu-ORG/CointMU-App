import type { ChildProcess } from "node:child_process";
import {
  GETH_READY_MARGIN_MS,
  GETH_READY_WAIT_MS,
  type GethReadiness,
} from "./gethReadiness";
import {
  GETH_GRACEFUL_TIMEOUT_MS,
  SUPERVISOR_EXIT_MARGIN_MS,
} from "./orphanedGeth";

/**
 * Stops one geth (or its supervisor); see killGethProcess.
 * @param proc - The process to stop.
 * @param readiness - That geth's readiness, see gethReadiness.ts.
 * @returns Resolves once the process has exited.
 */
export function stopProcess(
  proc: ChildProcess,
  readiness: GethReadiness,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const onExit = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve();
    };

    const forceKill = (): void => {
      if (settled) return;
      try {
        proc.kill("SIGKILL");
      } catch {}
    };

    proc.once("close", onExit);
    proc.once("exit", onExit);

    if (process.platform === "win32") {
      // Only the supervisor gets a stdin pipe.
      const supervisorStdin = proc.stdin;
      if (!supervisorStdin) {
        forceKill();
        return;
      }
      // The supervisor itself waits for a geth that is not ready yet.
      const readyWaitMs = readiness.isReady()
        ? 0
        : GETH_READY_WAIT_MS + GETH_READY_MARGIN_MS;
      killTimer = setTimeout(
        forceKill,
        readyWaitMs + GETH_GRACEFUL_TIMEOUT_MS + SUPERVISOR_EXIT_MARGIN_MS,
      );
      // destroy, not end: nothing is written, so a supervisor already gone
      // cannot raise EPIPE.
      supervisorStdin.destroy();
      return;
    }

    void readiness.untilInterruptible().then(() => {
      if (settled) return;
      killTimer = setTimeout(forceKill, GETH_GRACEFUL_TIMEOUT_MS);
      try {
        proc.kill("SIGINT");
      } catch {
        onExit();
      }
    });
  });
}
