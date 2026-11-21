import { IpcErrorCode } from "../../../bridge/types";

/**
 * The launch-time node startup (#158): stop a leftover geth, init genesis,
 * prepare IPC, spawn geth. It runs after the window and every IPC handler
 * exist and can take minutes (orphanReadiness.ts), so restarts, moves,
 * resyncs and cache clears wait for it instead of racing the spawn or
 * touching a datadir the leftover geth still writes.
 */

let isDone = false;
let openGate: () => void = () => undefined;
const done = new Promise<void>((resolve) => {
  openGate = resolve;
});

/** @returns True until the launch-time startup has finished or failed. */
export function isStartupInProgress(): boolean {
  return !isDone;
}

/** @returns Resolves once the launch-time startup has finished or failed. */
export function whenStartupDone(): Promise<void> {
  return done;
}

/** @throws NODE_STARTING while the launch-time startup runs. */
export function assertNodeStarted(): void {
  if (!isDone) throw new Error(IpcErrorCode.NODE_STARTING);
}

function markStartupDone(): void {
  if (isDone) return;
  isDone = true;
  openGate();
}

/** The launch-time startup steps, in order; tests pass fakes. */
export interface NodeStartupSteps {
  readonly stopOrphan: () => Promise<void>;
  readonly initGenesis: () => Promise<void>;
  readonly prepareIpc: () => Promise<void>;
  readonly spawn: () => Promise<void>;
}

/**
 * Runs the startup steps. A failed orphan stop or genesis init is logged and
 * the next step still runs, as before #158. The gate opens whatever happens.
 * @param steps - See NodeStartupSteps.
 * @throws What prepareIpc or spawn threw, after opening the gate.
 */
export async function runNodeStartup(steps: NodeStartupSteps): Promise<void> {
  try {
    try {
      await steps.stopOrphan();
    } catch (err) {
      console.error("[geth:orphan] Could not stop a leftover geth:", err);
    }
    try {
      await steps.initGenesis();
    } catch (err) {
      console.error("[geth:init] Fatal error during genesis init:", err);
    }
    await steps.prepareIpc();
    await steps.spawn();
  } finally {
    markStartupDone();
  }
}
