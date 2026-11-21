import { useEffect, useState } from "react";
import {
  isNodeStarting,
  subscribeNodeStartupDone,
} from "../api/node-startup.service";

/**
 * Follows the launch-time node startup (stopping a leftover geth, then
 * spawning geth), during which main refuses restarts, moves, resyncs and
 * cache clears. Main stays the source of truth; this only disables buttons.
 * @returns True while that startup runs.
 */
export function useIsNodeStarting(): boolean {
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    let isSubscribed = true;
    let isDone = false;
    isNodeStarting()
      .then((starting) => {
        if (isSubscribed && !isDone) setIsStarting(starting);
      })
      .catch((err: unknown) => {
        console.error("[node-startup] Failed to read the startup state", err);
      });
    const unsubscribe = subscribeNodeStartupDone(() => {
      isDone = true;
      setIsStarting(false);
    });
    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, []);

  return isStarting;
}
