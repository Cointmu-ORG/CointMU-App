import { STATS_POLL_INTERVAL_MS } from "../config/mining.constants";
import { useEffect, useRef, useState } from "react";
import { fetchPeerCount, fetchSyncingStatus } from "@/shared/api";
import {
  INITIAL_SYNC_TRACKER,
  deriveSyncStatus,
} from "../model/sync-status.util";
import type { SyncStatus, SyncTracker } from "../model/sync-status.types";

const INITIAL_SYNC_STATUS: SyncStatus = deriveSyncStatus(INITIAL_SYNC_TRACKER, {
  syncing: null,
  peerCount: null,
  timestampMs: 0,
}).status;

/**
 * Hook that polls eth_syncing and net_peerCount on the stats interval and
 * derives the node's sync status, carrying the synced debounce and block-rate
 * window between polls.
 * @returns The current sync status.
 */
function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(INITIAL_SYNC_STATUS);
  const trackerRef = useRef<SyncTracker>(INITIAL_SYNC_TRACKER);

  useEffect(() => {
    let mounted = true;

    const poll = async (): Promise<void> => {
      const [syncing, peerCount] = await Promise.all([
        fetchSyncingStatus(),
        fetchPeerCount(),
      ]);
      if (!mounted) {
        return;
      }

      const step = deriveSyncStatus(trackerRef.current, {
        syncing,
        peerCount,
        timestampMs: Date.now(),
      });
      trackerRef.current = step.tracker;
      setStatus(step.status);
    };

    void poll();
    const intervalId = setInterval(poll, STATS_POLL_INTERVAL_MS);

    return (): void => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  return status;
}

export { useSyncStatus };
