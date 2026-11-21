import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { killGethProcess, spawnGethProcess } from "./gethProcess";
import { restartNodeByUser } from "./nodeRestart";

// The launch-time startup is over unless a test says otherwise.
const startup = vi.hoisted(() => ({ isInProgress: false }));
vi.mock("./nodeStartup", () => ({
  isStartupInProgress: () => startup.isInProgress,
  assertNodeStarted: () => {
    if (startup.isInProgress) throw new Error("NODE_STARTING");
  },
}));

vi.mock("./gethProcess", () => ({
  NODE_RESTART_DELAY_MS: 1000,
  getNodeRecovery: () => null,
  killGethProcess: vi.fn(() => Promise.resolve()),
  spawnGethProcess: vi.fn(() => Promise.resolve()),
}));

const store = {};

describe("restartNodeByUser", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not kill or spawn geth while the launch-time startup runs", async () => {
    startup.isInProgress = true;

    expect(restartNodeByUser(store)).toBe(false);
    await vi.runAllTimersAsync();
    startup.isInProgress = false;

    expect(killGethProcess).not.toHaveBeenCalled();
    expect(spawnGethProcess).not.toHaveBeenCalled();
  });

  it("joins a restart already under way instead of spawning a second geth", async () => {
    expect(restartNodeByUser(store)).toBe(true);
    expect(restartNodeByUser(store)).toBe(true);
    await vi.runAllTimersAsync();

    expect(killGethProcess).toHaveBeenCalledTimes(1);
    expect(spawnGethProcess).toHaveBeenCalledTimes(1);
  });

  it("restarts again once the previous restart has finished", async () => {
    restartNodeByUser(store);
    await vi.runAllTimersAsync();
    restartNodeByUser(store);
    await vi.runAllTimersAsync();

    expect(spawnGethProcess).toHaveBeenCalledTimes(2);
  });
});
