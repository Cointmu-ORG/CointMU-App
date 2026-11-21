import { useEffect, useState } from "react";
import type { NodeStopWait } from "@bridge/types";
import { subscribeNodeStopWait } from "../api/node-stop-wait.service";

const TICK_MS = 1_000;

/** A stop waiting for geth, with the time it has waited so far. */
export interface NodeStopWaitView {
  readonly elapsedMs: number;
  readonly maxWaitMs: number;
}

/**
 * Follows a quit, restart or update that waits for geth's startup repair.
 * @returns The wait, ticking every second, or null while none is under way.
 */
export function useNodeStopWait(): NodeStopWaitView | null {
  const [wait, setWait] = useState<NodeStopWait | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(
    () =>
      subscribeNodeStopWait((next) => {
        setWait(next);
        setNow(Date.now());
      }),
    [],
  );

  useEffect(() => {
    if (!wait) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [wait]);

  if (!wait) return null;
  return {
    elapsedMs: Math.max(0, now - wait.startedAt),
    maxWaitMs: wait.maxWaitMs,
  };
}
