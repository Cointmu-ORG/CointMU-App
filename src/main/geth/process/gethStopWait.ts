import type { NodeStopWait } from "../../../bridge/types";
import { GETH_READY_WAIT_MS, type GethReadiness } from "./gethReadiness";

/** A shorter wait for geth's readiness is not worth a notice. */
export const STOP_WAIT_NOTICE_DELAY_MS = 2_000;

type StopWaitListener = (wait: NodeStopWait | null) => void;

const listeners = new Set<StopWaitListener>();

/**
 * @param listener - Called with the wait once a stop has waited
 *   STOP_WAIT_NOTICE_DELAY_MS for geth's readiness, then with null once
 *   geth can be interrupted (or has exited).
 * @returns Removes the listener.
 */
export function onGethStopWait(listener: StopWaitListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(wait: NodeStopWait | null): void {
  listeners.forEach((listener) => listener(wait));
}

/**
 * Tells the listeners about a stop that waits for geth (see gethReadiness.ts).
 * @param readiness - The stopped geth's readiness.
 * @param stopped - Resolves once that geth has exited.
 */
export function reportStopWait(
  readiness: GethReadiness,
  stopped: Promise<void>,
): void {
  if (readiness.isReady()) return;
  const wait: NodeStopWait = {
    startedAt: Date.now(),
    maxWaitMs: GETH_READY_WAIT_MS,
  };
  let isShown = false;
  const timer = setTimeout(() => {
    isShown = true;
    emit(wait);
  }, STOP_WAIT_NOTICE_DELAY_MS);
  void Promise.race([readiness.untilInterruptible(), stopped]).then(() => {
    clearTimeout(timer);
    if (isShown) emit(null);
  });
}
