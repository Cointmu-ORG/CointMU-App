import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decideMining,
  isWithinSchedule,
  type MiningConditions,
} from "./miningPolicy";
import { MiningPolicy, POLICY_CHECK_INTERVAL_MS } from "./miningPolicyRunner";

// No real mining anywhere in here: the miner is a fake (miner_* never runs).

const BASE: MiningConditions = {
  isEnabled: true,
  isOnBattery: false,
  pauseOnBattery: true,
  idleOnly: false,
  idleSeconds: 0,
  idleThresholdSeconds: 120,
  isScheduled: false,
  scheduleStartMinutes: 0,
  scheduleEndMinutes: 0,
  nowMinutes: 12 * 60,
};

const at = (hh: number, mm = 0): number => hh * 60 + mm;
// 22:00-07:00, across midnight.
const NIGHT = {
  isScheduled: true,
  scheduleStartMinutes: at(22),
  scheduleEndMinutes: at(7),
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
      "inside a night schedule after midnight",
      { ...NIGHT, nowMinutes: at(3) },
      "MINING",
    ],
    [
      "inside a night schedule before midnight",
      { ...NIGHT, nowMinutes: at(23, 30) },
      "MINING",
    ],
    [
      "outside a night schedule",
      { ...NIGHT, nowMinutes: at(12) },
      "PAUSED_SCHEDULE",
    ],
    [
      "at a night schedule's end",
      { ...NIGHT, nowMinutes: at(7) },
      "PAUSED_SCHEDULE",
    ],
    [
      "outside the schedule and active: schedule before idle",
      { ...NIGHT, nowMinutes: at(12), idleOnly: true, idleSeconds: 0 },
      "PAUSED_SCHEDULE",
    ],
    [
      "inside the schedule but active",
      { ...NIGHT, nowMinutes: at(1), idleOnly: true, idleSeconds: 0 },
      "PAUSED_USER_ACTIVE",
    ],
    [
      "on battery inside the schedule and idle: battery first",
      {
        ...NIGHT,
        nowMinutes: at(1),
        idleOnly: true,
        idleSeconds: 999,
        isOnBattery: true,
      },
      "PAUSED_BATTERY",
    ],
    [
      "scheduled but switched off",
      { ...NIGHT, nowMinutes: at(12), isEnabled: false },
      "STOPPED",
    ],
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

describe("isWithinSchedule", () => {
  it.each([
    [at(9), at(17), at(9), true],
    [at(9), at(17), at(16, 59), true],
    [at(9), at(17), at(17), false],
    [at(9), at(17), at(8, 59), false],
    [at(22), at(7), at(0), true],
    [at(22), at(7), at(6, 59), true],
    [at(22), at(7), at(21, 59), false],
    [at(8), at(8), at(3), true],
  ])("start %i end %i at %i: %s", (start, end, now, expected) => {
    expect(isWithinSchedule(start, end, now)).toBe(expected);
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

describe("MiningPolicy schedule over time", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pauses at the end of the window and resumes at its start, across midnight", async () => {
    vi.useFakeTimers();
    const node = fakeNode({ ...BASE, ...NIGHT, nowMinutes: at(6, 59) });
    const policy = new MiningPolicy(node);

    await policy.evaluate();
    expect(node.isRunning).toBe(true);

    node.conditions = { ...node.conditions, nowMinutes: at(7) };
    await vi.advanceTimersByTimeAsync(POLICY_CHECK_INTERVAL_MS);
    expect(node.isRunning).toBe(false);
    expect(policy.getStatus()).toBe("PAUSED_SCHEDULE");

    node.conditions = { ...node.conditions, nowMinutes: at(22) };
    await vi.advanceTimersByTimeAsync(POLICY_CHECK_INTERVAL_MS);
    expect(node.isRunning).toBe(true);
  });
});
