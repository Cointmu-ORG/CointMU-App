import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MiningAutoStartPhase } from "../../bridge/types";
import type { NodeStatus } from "../geth/rpc/nodeStatus";
import {
  AUTO_START_DELAY_MS,
  AUTO_START_POLL_MS,
  MiningAutoStart,
  isReadyToMine,
  type AutoStartSettings,
} from "./miningAutoStart";

const READY_SETTINGS: AutoStartSettings = {
  isOn: true,
  isMiningAllowed: true,
  hasRewardAddress: true,
  isHeldByBattery: false,
};
const READY_NODE: NodeStatus = {
  isOnline: true,
  syncPercent: null,
  isMining: false,
  peers: 2,
};
const LONG_WAIT_MS = 10 * 60_000;
const ONE_SECOND_MS = 1_000;

/** A fake node and settings the test changes, and what the auto-start did. */
function setup(settings: Partial<AutoStartSettings> = {}) {
  const world = {
    settings: { ...READY_SETTINGS, ...settings },
    node: { ...READY_NODE },
    isStarted: false,
  };
  const startMining = vi.fn(async () => {
    world.isStarted = true;
  });
  const publish = vi.fn();
  const autoStart = new MiningAutoStart({
    readSettings: () => world.settings,
    readNodeStatus: async () => world.node,
    isMiningStarted: () => world.isStarted,
    startMining,
    publish,
    now: Date.now,
  });
  return { world, autoStart, startMining, publish };
}

describe("isReadyToMine", () => {
  it("holds when every condition is met", () => {
    expect(isReadyToMine(READY_SETTINGS, READY_NODE)).toBe(true);
  });

  it.each([
    ["the node does not answer", {}, { isOnline: false }],
    ["the node has no peer", {}, { peers: 0 }],
    ["the peer count is unknown", {}, { peers: null }],
    ["the node is syncing", {}, { syncPercent: 42 }],
    ["no reward address is set", { hasRewardAddress: false }, {}],
    ["mining is not allowed", { isMiningAllowed: false }, {}],
    ["the setting is off", { isOn: false }, {}],
    ["the battery holds it back", { isHeldByBattery: true }, {}],
  ])("fails when %s", (_, settings, node) => {
    expect(
      isReadyToMine(
        { ...READY_SETTINGS, ...settings },
        { ...READY_NODE, ...node },
      ),
    ).toBe(false);
  });
});

describe("MiningAutoStart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not start while a condition is unmet", async () => {
    const { world, autoStart, startMining } = setup();
    world.node = { ...READY_NODE, peers: 0 };

    autoStart.begin();
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(startMining).not.toHaveBeenCalled();
    expect(autoStart.getState().phase).toBe(MiningAutoStartPhase.WAITING);
  });

  it("starts 30 s after the conditions are met, not after launch", async () => {
    const { world, autoStart, startMining, publish } = setup();
    world.node = { ...READY_NODE, syncPercent: 80 };
    autoStart.begin();
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    world.node = { ...READY_NODE };
    await vi.advanceTimersByTimeAsync(AUTO_START_POLL_MS);
    const metAt = Date.now();
    await vi.advanceTimersByTimeAsync(AUTO_START_DELAY_MS - ONE_SECOND_MS);

    expect(startMining).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith({
      phase: MiningAutoStartPhase.COUNTDOWN,
      startsAt: metAt + AUTO_START_DELAY_MS,
    });

    await vi.advanceTimersByTimeAsync(ONE_SECOND_MS);

    expect(startMining).toHaveBeenCalledOnce();
    expect(autoStart.getState()).toEqual({
      phase: MiningAutoStartPhase.DONE,
      startsAt: null,
    });
  });

  it("does not start once cancelled, for the rest of the session", async () => {
    const { autoStart, startMining, publish } = setup();
    autoStart.begin();
    await vi.advanceTimersByTimeAsync(ONE_SECOND_MS);

    autoStart.cancel();
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(startMining).not.toHaveBeenCalled();
    expect(publish).toHaveBeenLastCalledWith({
      phase: MiningAutoStartPhase.DONE,
      startsAt: null,
    });
  });

  it("waits on battery with Pause on battery, then counts from plug-in", async () => {
    const { world, autoStart, startMining } = setup({ isHeldByBattery: true });
    autoStart.begin();
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(startMining).not.toHaveBeenCalled();

    world.settings = { ...world.settings, isHeldByBattery: false };
    await vi.advanceTimersByTimeAsync(AUTO_START_POLL_MS);
    await vi.advanceTimersByTimeAsync(AUTO_START_DELAY_MS - ONE_SECOND_MS);
    expect(startMining).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ONE_SECOND_MS);

    expect(startMining).toHaveBeenCalledOnce();
  });

  it("goes back to waiting when unplugged during the countdown", async () => {
    const { world, autoStart, startMining } = setup();
    autoStart.begin();
    await vi.advanceTimersByTimeAsync(ONE_SECOND_MS);

    world.settings = { ...world.settings, isHeldByBattery: true };
    await vi.advanceTimersByTimeAsync(AUTO_START_DELAY_MS);

    expect(startMining).not.toHaveBeenCalled();
    expect(autoStart.getState().phase).toBe(MiningAutoStartPhase.WAITING);
  });

  it("does not start again after the user stopped mining by hand", async () => {
    const { world, autoStart, startMining } = setup();
    autoStart.begin();
    await vi.advanceTimersByTimeAsync(AUTO_START_DELAY_MS + ONE_SECOND_MS);
    expect(startMining).toHaveBeenCalledOnce();

    // The user stops mining: the controller ends the auto-start.
    world.isStarted = false;
    autoStart.endForSession();
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(startMining).toHaveBeenCalledOnce();
  });

  it("does not start after a manual stop before the countdown ended", async () => {
    const { autoStart, startMining } = setup();
    autoStart.begin();
    await vi.advanceTimersByTimeAsync(ONE_SECOND_MS);

    autoStart.endForSession();
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(startMining).not.toHaveBeenCalled();
  });

  it("stands down when the user started mining first", async () => {
    const { world, autoStart, startMining } = setup();
    world.node = { ...READY_NODE, peers: 0 };
    autoStart.begin();

    world.isStarted = true;
    world.node = { ...READY_NODE };
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(startMining).not.toHaveBeenCalled();
    expect(autoStart.getState().phase).toBe(MiningAutoStartPhase.DONE);
  });

  it("does nothing in a session that launched with the setting off", async () => {
    const { world, autoStart, startMining } = setup({ isOn: false });
    autoStart.begin();

    world.settings = { ...world.settings, isOn: true };
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(startMining).not.toHaveBeenCalled();
  });

  it("stops for the session when the setting is turned off", async () => {
    const { world, autoStart, startMining } = setup();
    autoStart.begin();
    await vi.advanceTimersByTimeAsync(ONE_SECOND_MS);

    world.settings = { ...world.settings, isOn: false };
    await vi.advanceTimersByTimeAsync(AUTO_START_POLL_MS);
    world.settings = { ...world.settings, isOn: true };
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(startMining).not.toHaveBeenCalled();
  });

  it("keeps waiting when the node cannot be read", async () => {
    const startMining = vi.fn(async () => undefined);
    const failing = new MiningAutoStart({
      readSettings: () => READY_SETTINGS,
      readNodeStatus: () => Promise.reject(new Error("socket closed")),
      isMiningStarted: () => false,
      startMining,
      publish: vi.fn(),
      now: Date.now,
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    failing.begin();
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(startMining).not.toHaveBeenCalled();
    expect(failing.getState().phase).toBe(MiningAutoStartPhase.WAITING);
    failing.cancel();
  });
});
