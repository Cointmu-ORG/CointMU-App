import { describe, expect, it, vi } from "vitest";
import { decideMining, type MiningConditions } from "./miningPolicy";
import { MiningPolicy } from "./miningPolicyRunner";

// No real mining anywhere in here: the miner is a fake (miner_* never runs).

const BASE: MiningConditions = {
  isEnabled: true,
  isOnBattery: false,
  pauseOnBattery: true,
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
