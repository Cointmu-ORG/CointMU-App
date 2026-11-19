import { describe, expect, it, vi } from "vitest";
import { SyncStallStep } from "../../../bridge/types";
import {
  STALL_WINDOW_MS,
  SYNC_POLL_INTERVAL_MS,
  SyncStallWatchdog,
  type SyncProgress,
} from "./syncStallWatchdog";

const STALLED: SyncProgress = { localBlock: 100, isBehind: true, peers: 2 };

function createHarness() {
  const state = {
    isRunning: true,
    isBusy: false,
    progress: STALLED as SyncProgress | null,
  };
  const steps: (SyncStallStep | null)[] = [];
  const reregisterPeers = vi.fn(async () => {});
  const restartNode = vi.fn();
  const watchdog = new SyncStallWatchdog({
    isGethRunning: () => state.isRunning,
    isLifecycleBusy: () => state.isBusy,
    readProgress: async () => state.progress,
    reregisterPeers,
    restartNode,
    broadcast: (step) => steps.push(step),
  });
  let nowMs = 0;
  /** Polls every interval for `durationMs`, as the timer would. */
  const run = async (durationMs: number): Promise<void> => {
    const endMs = nowMs + durationMs;
    while (nowMs <= endMs) {
      await watchdog.tick(nowMs);
      nowMs += SYNC_POLL_INTERVAL_MS;
    }
  };
  return { watchdog, state, steps, reregisterPeers, restartNode, run };
}

describe("SyncStallWatchdog", () => {
  it("stays quiet while the head keeps moving", async () => {
    const h = createHarness();
    for (let block = 100; block < 140; block++) {
      h.state.progress = { ...STALLED, localBlock: block };
      await h.run(SYNC_POLL_INTERVAL_MS - 1);
    }
    expect(h.steps).toEqual([]);
  });

  it("escalates one step per window and never resyncs by itself", async () => {
    const h = createHarness();
    await h.run(STALL_WINDOW_MS);
    expect(h.watchdog.getStep()).toBe(SyncStallStep.REREGISTER_PEERS);
    expect(h.reregisterPeers).toHaveBeenCalledTimes(1);
    expect(h.restartNode).not.toHaveBeenCalled();

    await h.run(STALL_WINDOW_MS);
    expect(h.watchdog.getStep()).toBe(SyncStallStep.RESTART_NODE);
    expect(h.restartNode).toHaveBeenCalledTimes(1);

    await h.run(STALL_WINDOW_MS * 3);
    expect(h.steps).toEqual([
      SyncStallStep.REREGISTER_PEERS,
      SyncStallStep.RESTART_NODE,
      SyncStallStep.NEEDS_RESYNC,
    ]);
    expect(h.reregisterPeers).toHaveBeenCalledTimes(1);
    expect(h.restartNode).toHaveBeenCalledTimes(1);
  });

  it("clears the step once the head moves again", async () => {
    const h = createHarness();
    await h.run(STALL_WINDOW_MS);
    h.state.progress = { ...STALLED, localBlock: 101 };
    await h.run(0);
    expect(h.steps).toEqual([SyncStallStep.REREGISTER_PEERS, null]);
  });

  it("leaves zero peers to the peer watchdog", async () => {
    const h = createHarness();
    h.state.progress = { ...STALLED, peers: 0 };
    await h.run(STALL_WINDOW_MS * 4);
    expect(h.steps).toEqual([]);
    expect(h.restartNode).not.toHaveBeenCalled();
  });

  it("does nothing on a synced node whose head waits for the next block", async () => {
    const h = createHarness();
    h.state.progress = { ...STALLED, isBehind: false };
    await h.run(STALL_WINDOW_MS * 4);
    expect(h.steps).toEqual([]);
  });

  it("yields to recovery or a move: no count, no restart, step cleared", async () => {
    const h = createHarness();
    await h.run(STALL_WINDOW_MS);
    h.state.isBusy = true;
    await h.run(STALL_WINDOW_MS * 4);
    expect(h.watchdog.getStep()).toBeNull();
    expect(h.restartNode).not.toHaveBeenCalled();
  });

  it("pauses while geth restarts, keeping the step", async () => {
    const h = createHarness();
    await h.run(STALL_WINDOW_MS * 2);
    expect(h.watchdog.getStep()).toBe(SyncStallStep.RESTART_NODE);
    h.state.isRunning = false;
    await h.run(STALL_WINDOW_MS * 2);
    expect(h.watchdog.getStep()).toBe(SyncStallStep.RESTART_NODE);
  });
});
