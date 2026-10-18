import type { SyncingDto } from "@/shared/api";

type SyncStatusKind = "no-peers" | "waiting" | "syncing" | "synced";

interface SyncStatus {
  status: SyncStatusKind;
  currentBlock: number | null;
  highestBlock: number | null;
  startingBlock: number | null;
  progressPercent: number | null;
  blocksPerSecond: number | null;
  etaSeconds: number | null;
}

/** One poll's raw readings; null means the RPC call failed. */
interface SyncPollSample {
  syncing: SyncingDto | false | null;
  peerCount: number | null;
  timestampMs: number;
}

interface BlockSample {
  block: number;
  timestampMs: number;
}

/** State carried between polls for the synced debounce and the rate window. */
interface SyncTracker {
  syncedStreak: number;
  rateSamples: readonly BlockSample[];
}

interface EtaDuration {
  hours: number;
  minutes: number;
  seconds: number;
}

export type {
  SyncStatusKind,
  SyncStatus,
  SyncPollSample,
  BlockSample,
  SyncTracker,
  EtaDuration,
};
