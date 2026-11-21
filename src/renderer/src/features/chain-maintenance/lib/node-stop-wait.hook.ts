import { useEffect, useState } from "react";
import type { NodeStopWait } from "@bridge/types";
import {
  getNodeStopWait,
  subscribeNodeStopWait,
} from "../api/node-stop-wait.service";

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

  useEffect(() => {
    let isSubscribed = true;
    let hasEvent = false;
    // The startup stop of a leftover geth can begin before this mounts.
    getNodeStopWait()
      .then((initial) => {
        if (!isSubscribed || hasEvent) return;
        setWait(initial);
        setNow(Date.now());
      })
      .catch((err: unknown) => {
        console.error("[node-stop-wait] Failed to load the stop wait", err);
      });
    const unsubscribe = subscribeNodeStopWait((next) => {
      hasEvent = true;
      setWait(next);
      setNow(Date.now());
    });
    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, []);

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
