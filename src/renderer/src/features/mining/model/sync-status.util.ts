import {
  PERCENT_MAX,
  SECONDS_PER_HOUR,
  SECONDS_PER_MINUTE,
  SECONDS_TO_MS,
  SYNC_PERCENT_DECIMAL_FACTOR,
  SYNC_RATE_MIN_SAMPLES,
  SYNC_RATE_WINDOW_SAMPLES,
  SYNC_STABLE_POLLS,
} from "../config/mining.constants";
import type { SyncingDto } from "@/shared/api";
import type {
  BlockSample,
  EtaDuration,
  SyncPollSample,
  SyncStatus,
  SyncStatusKind,
  SyncTracker,
} from "./sync-status.types";

interface SyncStep {
  status: SyncStatus;
  tracker: SyncTracker;
}

const INITIAL_SYNC_TRACKER: SyncTracker = { syncedStreak: 0, rateSamples: [] };

const EMPTY_PROGRESS: Omit<SyncStatus, "status"> = {
  currentBlock: null,
  highestBlock: null,
  startingBlock: null,
  progressPercent: null,
  blocksPerSecond: null,
  etaSeconds: null,
};

/**
 * Builds a step with no progress figures and a cleared rate window.
 * @param status - The status to report.
 * @param syncedStreak - The synced streak to carry forward.
 * @returns The status/tracker step.
 */
function idleStep(status: SyncStatusKind, syncedStreak: number): SyncStep {
  return {
    status: { status, ...EMPTY_PROGRESS },
    tracker: { syncedStreak, rateSamples: [] },
  };
}

/**
 * Computes the moving-average import rate across the sample window.
 * @param samples - Block samples, oldest first.
 * @returns Blocks per second, or null until the window is stable and moving.
 */
function computeBlockRate(samples: readonly BlockSample[]): number | null {
  if (samples.length < SYNC_RATE_MIN_SAMPLES) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsedMs = last.timestampMs - first.timestampMs;
  if (elapsedMs <= 0) return null;
  const rate = ((last.block - first.block) / elapsedMs) * SECONDS_TO_MS;
  return rate > 0 ? rate : null;
}

/**
 * Appends a block sample to the window, restarting it if the head went
 * backwards (e.g. chaindata was reset) and dropping samples past the cap.
 * @param samples - The current window, oldest first.
 * @param next - The new sample.
 * @returns The updated window.
 */
function pushRateSample(
  samples: readonly BlockSample[],
  next: BlockSample,
): readonly BlockSample[] {
  const last = samples[samples.length - 1];
  if (last !== undefined && next.block < last.block) return [next];
  return [...samples, next].slice(-SYNC_RATE_WINDOW_SAMPLES);
}

/**
 * Derives the progress figures for an in-flight sync object.
 * @param syncing - The parsed eth_syncing progress.
 * @param prev - The tracker from the previous poll.
 * @param timestampMs - When this poll was taken.
 * @returns The status/tracker step.
 */
function syncingStep(
  syncing: SyncingDto,
  prev: SyncTracker,
  timestampMs: number,
): SyncStep {
  const { currentBlock, highestBlock, startingBlock } = syncing;
  const blocks = { currentBlock, highestBlock, startingBlock };

  // Without a known target ahead of the head, a percentage is meaningless.
  if (highestBlock <= currentBlock) {
    return {
      status: { ...EMPTY_PROGRESS, ...blocks, status: "waiting" },
      tracker: INITIAL_SYNC_TRACKER,
    };
  }

  const rateSamples = pushRateSample(prev.rateSamples, {
    block: currentBlock,
    timestampMs,
  });
  const blocksPerSecond = computeBlockRate(rateSamples);
  const rawPercent = (currentBlock / highestBlock) * PERCENT_MAX;

  return {
    status: {
      ...blocks,
      status: "syncing",
      progressPercent:
        Math.floor(rawPercent * SYNC_PERCENT_DECIMAL_FACTOR) /
        SYNC_PERCENT_DECIMAL_FACTOR,
      blocksPerSecond,
      etaSeconds:
        blocksPerSecond === null
          ? null
          : Math.ceil((highestBlock - currentBlock) / blocksPerSecond),
    },
    tracker: { syncedStreak: 0, rateSamples },
  };
}

/**
 * Maps one poll of eth_syncing + net_peerCount into the frontend sync status.
 * "synced" is debounced: it is only reported after SYNC_STABLE_POLLS
 * consecutive synced polls, and any other reading resets the streak.
 * @param prev - The tracker from the previous poll.
 * @param sample - This poll's raw readings.
 * @returns The derived status and the tracker to feed into the next poll.
 */
function deriveSyncStatus(prev: SyncTracker, sample: SyncPollSample): SyncStep {
  const { syncing, peerCount, timestampMs } = sample;
  if (syncing === null || peerCount === null) return idleStep("waiting", 0);
  // Checked first: a peerless node reports eth_syncing false and would
  // otherwise look synced.
  if (peerCount === 0) return idleStep("no-peers", 0);
  if (syncing !== false) return syncingStep(syncing, prev, timestampMs);

  const syncedStreak = prev.syncedStreak + 1;
  return idleStep(
    syncedStreak >= SYNC_STABLE_POLLS ? "synced" : "waiting",
    syncedStreak,
  );
}

/**
 * Rounds an ETA so the displayed text stays steady between polls: under a
 * minute it keeps seconds, otherwise it rounds to whole minutes (and splits
 * out hours) with no seconds.
 * @param etaSeconds - The raw ETA in seconds.
 * @returns The rounded duration parts.
 */
function toEtaDuration(etaSeconds: number): EtaDuration {
  if (etaSeconds < SECONDS_PER_MINUTE) {
    return { hours: 0, minutes: 0, seconds: Math.ceil(etaSeconds) };
  }
  const totalMinutes = Math.round(etaSeconds / SECONDS_PER_MINUTE);
  const minutesPerHour = SECONDS_PER_HOUR / SECONDS_PER_MINUTE;
  return {
    hours: Math.floor(totalMinutes / minutesPerHour),
    minutes: totalMinutes % minutesPerHour,
    seconds: 0,
  };
}

export {
  INITIAL_SYNC_TRACKER,
  deriveSyncStatus,
  computeBlockRate,
  toEtaDuration,
};
export type { SyncStep };
