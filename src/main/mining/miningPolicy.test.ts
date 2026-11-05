import { afterEach, describe, expect, it, vi } from "vitest";
import { decideMining, type MiningConditions } from "./miningPolicy";
import { MiningPolicy, POLICY_CHECK_INTERVAL_MS } from "./miningPolicyRunner";

// No real mining anywhere in here: the miner is a fake (miner_* never runs).

const BASE: MiningConditions = {
  isEnabled: true,
  isOnBattery: false,
  pauseOnBattery: true,
  idleOnly: false,
  idleSeconds: 0,
  idleThresholdSeconds: 120,
};

describe("decideMining", () => {
  it.each([
    ["mining is off", { isEnabled: false }, "STOPPED"],
    ["on AC", {}, "MINING"],
    ["on battery", { isOnBattery: true }, "PAUSED_BATTERY"],
    [
      "on battery without the pause",
      { isOnBattery: true, pauseOnBattery: false },
      "MINING",
    ],
    [
      "mining is off on battery",
      { isEnabled: false, isOnBattery: true },
      "STOPPED",
    ],
    [
      "idle-only while the user is active",
      { idleOnly: true, idleSeconds: 30 },
      "PAUSED_USER_ACTIVE",
    ],
    [
      "idle-only once idle long enough",
      { idleOnly: true, idleSeconds: 120 },
      "MINING",
    ],
    ["active without idle-only", { idleSeconds: 0 }, "MINING"],
    [
      "on battery and active: battery first",
      { idleOnly: true, idleSeconds: 0, isOnBattery: true },
      "PAUSED_BATTERY",
    ],
  ] as const)("decides %s", (_label, overrides, expected) => {
    expect(decideMining({ ...BASE, ...overrides })).toBe(expected);
  });
});

function fakeNode(conditions: MiningConditions, isRunning = false) {
  const node = {
    conditions,
    isRunning,
    readConditions: () => node.conditions,
    isMinerRunning: vi.fn(async () => node.isRunning),
    startMiner: vi.fn(async () => {
      node.isRunning = true;
    }),
    stopMiner: vi.fn(async () => {
      node.isRunning = false;
    }),
    publish: vi.fn(),
  };
  return node;
}

describe("MiningPolicy", () => {
  it("starts switched-on mining, pauses it on battery and resumes on AC", async () => {
    const node = fakeNode(BASE);
    const policy = new MiningPolicy(node);

    await policy.evaluate();
    expect(node.startMiner).toHaveBeenCalledOnce();
    expect(policy.getStatus()).toBe("MINING");

    node.conditions = { ...BASE, isOnBattery: true };
    await policy.evaluate();
    expect(node.stopMiner).toHaveBeenCalledOnce();
    expect(node.publish).toHaveBeenLastCalledWith("PAUSED_BATTERY");

    node.conditions = BASE;
    await policy.evaluate();
    expect(node.startMiner).toHaveBeenCalledTimes(2);
    expect(node.publish).toHaveBeenLastCalledWith("MINING");
  });

  it("never touches the miner while the user has mining off", async () => {
    const node = fakeNode({ ...BASE, isEnabled: false }, true);
    const policy = new MiningPolicy(node);

    await policy.evaluate();

    expect(node.isMinerRunning).not.toHaveBeenCalled();
    expect(node.startMiner).not.toHaveBeenCalled();
    expect(node.stopMiner).not.toHaveBeenCalled();
    expect(policy.getStatus()).toBe("STOPPED");
  });

  it("publishes only changes", async () => {
    const node = fakeNode(BASE, true);
    const policy = new MiningPolicy(node);

    await policy.evaluate();
    await policy.evaluate();

    expect(node.publish).toHaveBeenCalledOnce();
    expect(node.startMiner).not.toHaveBeenCalled();
  });

  it("runs one evaluation at a time and re-runs once for requests meanwhile", async () => {
    const node = fakeNode(BASE);
    let release: () => void = () => {};
    node.isMinerRunning.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (release = () => resolve(false))),
    );
    const policy = new MiningPolicy(node);

    const first = policy.evaluate();
    const second = policy.evaluate();
    const third = policy.evaluate();
    release();
    await Promise.all([first, second, third]);

    expect(node.isMinerRunning).toHaveBeenCalledTimes(2);
    expect(node.startMiner).toHaveBeenCalledOnce();
  });

  it("keeps the decision when the node cannot be reached", async () => {
    const node = fakeNode(BASE);
    node.isMinerRunning.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const policy = new MiningPolicy(node);

    await expect(policy.evaluate()).resolves.toBeUndefined();
    expect(policy.getStatus()).toBe("MINING");
  });
});

describe("MiningPolicy timer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-checks idle time only while idle-only mining is started", async () => {
    vi.useFakeTimers();
    const node = fakeNode({ ...BASE, idleOnly: true, idleSeconds: 10 });
    const readConditions = vi.fn(() => node.conditions);
    const policy = new MiningPolicy({ ...node, readConditions });

    await policy.evaluate();
    expect(node.startMiner).not.toHaveBeenCalled();

    node.conditions = { ...node.conditions, idleSeconds: 600 };
    await vi.advanceTimersByTimeAsync(POLICY_CHECK_INTERVAL_MS);
    expect(node.startMiner).toHaveBeenCalledOnce();

    node.conditions = { ...node.conditions, isEnabled: false };
    await vi.advanceTimersByTimeAsync(POLICY_CHECK_INTERVAL_MS);
    const callsWhenOff = readConditions.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLICY_CHECK_INTERVAL_MS * 4);
    expect(readConditions.mock.calls.length).toBe(callsWhenOff);
  });
});
