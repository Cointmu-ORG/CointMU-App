import { useCallback, useEffect, useState } from "react";
import { NodeRecoveryStage, type NodeRecoveryEvent } from "@bridge/types";
import { RECOVERED_BANNER_VISIBLE_MS } from "../config/mining.constants";
import {
  getNodeRecoveryState,
  retryNode,
  subscribeNodeRecovery,
} from "../api/node-recovery.service";

interface NodeRecoveryState {
  event: NodeRecoveryEvent | null;
  isRetrying: boolean;
  retry: () => Promise<void>;
}

/**
 * Tracks the latest node recovery event. Hydrates from the main process on
 * mount, clears on RESUMED, and hides RECOVERED after a short delay.
 * @returns The current event, retry state, and a retry action.
 */
function useNodeRecovery(): NodeRecoveryState {
  const [event, setEvent] = useState<NodeRecoveryEvent | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getNodeRecoveryState()
      .then((initial) => {
        if (isMounted && initial) setEvent((current) => current ?? initial);
      })
      .catch((err: unknown) => {
        console.error("[node-recovery] Failed to load recovery state", err);
      });
    const unsubscribe = subscribeNodeRecovery((next) => {
      setEvent(next.stage === NodeRecoveryStage.RESUMED ? null : next);
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (event?.stage !== NodeRecoveryStage.RECOVERED) return;
    const timer = setTimeout(() => setEvent(null), RECOVERED_BANNER_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [event]);

  const retry = useCallback(async (): Promise<void> => {
    setIsRetrying(true);
    try {
      await retryNode();
      setEvent(null);
    } catch (err) {
      console.error("[node-recovery] Retry failed", err);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  return { event, isRetrying, retry };
}

export { useNodeRecovery };
