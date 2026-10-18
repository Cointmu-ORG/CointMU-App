import { describe, expect, it } from "vitest";
import { SYNC_STABLE_POLLS } from "../config/mining.constants";
import {
  INITIAL_SYNC_TRACKER,
  deriveSyncStatus,
  computeBlockRate,
  toEtaDuration,
} from "./sync-status.util";
import type {
  SyncPollSample,
  SyncStatus,
  SyncTracker,
} from "./sync-status.types";

const POLL_MS = 2000;
const PEERS = 3;

type PollInput = Pick<SyncPollSample, "syncing" | "peerCount">;

const SYNCED: PollInput = { syncing: false, peerCount: PEERS };

/**
 * Feeds polls through deriveSyncStatus in order, POLL_MS apart.
 * @param polls - The raw readings to feed.
 * @returns The status after every poll and the final tracker.
 */
function runPolls(polls: PollInput[]): {
  statuses: SyncStatus[];
  tracker: SyncTracker;
} {
  let tracker = INITIAL_SYNC_TRACKER;
  const statuses = polls.map((poll, index) => {
    const step = deriveSyncStatus(tracker, {
      ...poll,
      timestampMs: index * POLL_MS,
    });
    tracker = step.tracker;
    return step.status;
  });
  return { statuses, tracker };
}

/**
 * Builds an in-flight eth_syncing reading.
 * @param currentBlock - The local head.
 * @param highestBlock - The network head.
 * @returns The poll input.
 */
function syncingAt(currentBlock: number, highestBlock: number): PollInput {
  return {
    syncing: { startingBlock: 0, currentBlock, highestBlock },
    peerCount: PEERS,
  };
}

describe("deriveSyncStatus", () => {
  it("reports waiting when either RPC call failed", () => {
    const { statuses } = runPolls([
      { syncing: null, peerCount: PEERS },
      { syncing: false, peerCount: null },
    ]);

    expect(statuses.map((s) => s.status)).toEqual(["waiting", "waiting"]);
  });

  it("reports no-peers even when eth_syncing is false", () => {
    const { statuses } = runPolls([{ syncing: false, peerCount: 0 }]);

    expect(statuses[0].status).toBe("no-peers");
  });

  it("debounces synced until SYNC_STABLE_POLLS consecutive polls", () => {
    const { statuses } = runPolls(Array(SYNC_STABLE_POLLS).fill(SYNCED));

    expect(statuses.map((s) => s.status)).toEqual([
      ...Array(SYNC_STABLE_POLLS - 1).fill("waiting"),
      "synced",
    ]);
  });

  it("resets the synced streak when the condition breaks", () => {
    const almostSynced = Array(SYNC_STABLE_POLLS - 1).fill(SYNCED);

    const { statuses } = runPolls([
      ...almostSynced,
      { syncing: false, peerCount: 0 },
      ...almostSynced,
      syncingAt(5, 10),
      ...almostSynced,
    ]);

    expect(statuses.some((s) => s.status === "synced")).toBe(false);
  });

  it("reports waiting without a percent when highestBlock is 0", () => {
    const { statuses } = runPolls([syncingAt(0, 0)]);

    expect(statuses[0]).toMatchObject({
      status: "waiting",
      highestBlock: 0,
      progressPercent: null,
      etaSeconds: null,
    });
  });

  it("reports waiting when highestBlock is not ahead of currentBlock", () => {
    const { statuses } = runPolls([syncingAt(120, 100)]);

    expect(statuses[0]).toMatchObject({
      status: "waiting",
      progressPercent: null,
    });
  });

  it("floors the percent to one decimal so it never reads 100", () => {
    const { statuses } = runPolls([syncingAt(9999, 10000)]);

    expect(statuses[0]).toMatchObject({
      status: "syncing",
      progressPercent: 99.9,
    });
  });

  it("withholds rate and ETA until the window has enough samples", () => {
    const { statuses } = runPolls([
      syncingAt(100, 1100),
      syncingAt(200, 1100),
      syncingAt(300, 1100),
    ]);

    expect(statuses[1].blocksPerSecond).toBeNull();
    expect(statuses[1].etaSeconds).toBeNull();
    // 200 blocks over 4s = 50 blocks/s; 800 blocks left = 16s.
    expect(statuses[2].blocksPerSecond).toBe(50);
    expect(statuses[2].etaSeconds).toBe(16);
  });

  it("restarts the rate window when the head goes backwards", () => {
    const { statuses, tracker } = runPolls([
      syncingAt(100, 1100),
      syncingAt(200, 1100),
      syncingAt(50, 1100),
    ]);

    expect(tracker.rateSamples).toHaveLength(1);
    expect(statuses[2].blocksPerSecond).toBeNull();
  });
});

describe("computeBlockRate", () => {
  it("returns null when the head did not move", () => {
    const samples = [0, 1, 2].map((i) => ({
      block: 10,
      timestampMs: i * POLL_MS,
    }));

    expect(computeBlockRate(samples)).toBeNull();
  });
});

describe("toEtaDuration", () => {
  it("keeps seconds under a minute", () => {
    expect(toEtaDuration(45)).toEqual({ hours: 0, minutes: 0, seconds: 45 });
  });

  it("rounds to whole minutes from one minute up", () => {
    expect(toEtaDuration(89)).toEqual({ hours: 0, minutes: 1, seconds: 0 });
    expect(toEtaDuration(90)).toEqual({ hours: 0, minutes: 2, seconds: 0 });
  });

  it("splits hours and drops seconds from one hour up", () => {
    expect(toEtaDuration(3725)).toEqual({ hours: 1, minutes: 2, seconds: 0 });
  });
});
