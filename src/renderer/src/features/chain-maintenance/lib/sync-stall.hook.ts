import { useEffect, useState } from "react";
import type { SyncStallStep } from "@bridge/types";
import { getSyncStall, subscribeSyncStall } from "../api/sync-stall.service";

/**
 * Follows the main-process sync stall watchdog. Hydrates on mount.
 * @returns The current step, or null while sync is healthy.
 */
export function useSyncStall(): SyncStallStep | null {
  const [step, setStep] = useState<SyncStallStep | null>(null);

  useEffect(() => {
    let isMounted = true;
    getSyncStall()
      .then((initial) => {
        if (isMounted) setStep((current) => current ?? initial);
      })
      .catch((err: unknown) => {
        console.error("[sync-stall] Failed to load the stall step", err);
      });
    const unsubscribe = subscribeSyncStall(setStep);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return step;
}
