import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MiningAutoStartPhase } from "../../bridge/types";
import { AUTO_START_DELAY_MS } from "./miningAutoStart";

// No real node and no real mining: geth's RPC is a fake that records the
// miner_* calls (the DAG alone is about 2.2 GB).
const power = vi.hoisted(() => ({ isOnBattery: false }));
const node = vi.hoisted(() => ({
  syncing: false as unknown,
  peers: "0x1",
  isMining: false,
  calls: [] as string[],
}));

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  powerMonitor: {
    isOnBatteryPower: () => power.isOnBattery,
    getSystemIdleTime: () => 0,
    on: vi.fn(),
  },
  Notification: { isSupported: () => false },
}));

vi.mock("../geth/rpc/rpcUtils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../geth/rpc/rpcUtils")>()),
  callGethRpc: vi.fn(async (_port: number, method: string) => {
    node.calls.push(method);
    if (method === "eth_syncing") return node.syncing;
    if (method === "net_peerCount") return node.peers;
    if (method === "eth_mining") return node.isMining;
    if (method === "miner_start") node.isMining = true;
    if (method === "miner_stop") node.isMining = false;
    return true;
  }),
}));

vi.mock("../wallet/activityScanner", () => ({
  scanWalletActivity: vi.fn(),
  fetchNetworkInsights: vi.fn(),
}));

const { ipcMain } = await import("electron");
const { MiningController } = await import("./miningController");

const RPC_PORT = 8585;
const REWARD_ADDRESS = "0x2CF2762952207957FCEe044083685656C4072E2f";
const LONG_WAIT_MS = 10 * 60_000;
const ONE_SECOND_MS = 1_000;

/** @returns A store with every condition met, as a dotted-key map. */
function makeStore(overrides: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(
    Object.entries({
      "mining.autoStartAtLaunch": true,
      "mining.isMiningEnabled": true,
      "mining.poolAddress": REWARD_ADDRESS,
      "mining.pauseOnBattery": true,
      "mining.cpuThreads": 2,
      ...overrides,
    }),
  );
  return {
    get: (key: string) => data.get(key),
    set: (key: string, value: unknown) => data.set(key, value),
    onDidChange: vi.fn(),
  };
}

/** Builds the controller and starts the auto-start as the app does. */
function launch(overrides: Record<string, unknown> = {}) {
  const store = makeStore(overrides);
  const controller = new MiningController(RPC_PORT, store);
  const send = vi.fn();
  controller.setWindow({
    isDestroyed: () => false,
    webContents: { send },
  } as never);
  controller.beginAutoStart();
  return { controller, send };
}

/**
 * @param channel - An ipcMain.handle channel.
 * @returns The handler the last controller registered for it.
 */
function handler(channel: string): (...args: unknown[]) => unknown {
  const calls = vi.mocked(ipcMain.handle).mock.calls;
  const found = calls.filter(([name]) => name === channel).at(-1);
  if (!found) throw new Error(`no handler for ${channel}`);
  return found[1] as (...args: unknown[]) => unknown;
}

const minerStarts = (): number =>
  node.calls.filter((method) => method === "miner_start").length;

describe("MiningController: start mining at launch (mocked RPC)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    power.isOnBattery = false;
    Object.assign(node, {
      syncing: false,
      peers: "0x1",
      isMining: false,
      calls: [],
    });
  });

  afterEach(() => {
    vi.mocked(ipcMain.handle).mockClear();
    vi.useRealTimers();
  });

  it("calls miner_start 30 s after the node is ready, with the reward address", async () => {
    const { send } = launch();
    await vi.advanceTimersByTimeAsync(AUTO_START_DELAY_MS - ONE_SECOND_MS);

    expect(minerStarts()).toBe(0);
    expect(send).toHaveBeenCalledWith(
      "mining:auto-start",
      expect.objectContaining({ phase: MiningAutoStartPhase.COUNTDOWN }),
    );

    await vi.advanceTimersByTimeAsync(ONE_SECOND_MS);

    expect(minerStarts()).toBe(1);
    const setEtherbase = vi
      .mocked((await import("../geth/rpc/rpcUtils")).callGethRpc)
      .mock.calls.find(([, method]) => method === "miner_setEtherbase");
    expect(setEtherbase?.[2]).toEqual([REWARD_ADDRESS]);
  });

  it.each([
    [
      "the node is syncing",
      () => (node.syncing = { currentBlock: "0x1", highestBlock: "0x9" }),
    ],
    ["the node has no peer", () => (node.peers = "0x0")],
    ["the laptop runs on battery", () => (power.isOnBattery = true)],
  ])("never calls miner_start while %s", async (_, arrange) => {
    arrange();

    launch();
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(minerStarts()).toBe(0);
  });

  it("never calls miner_start without a reward address", async () => {
    launch({ "mining.poolAddress": "" });
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(minerStarts()).toBe(0);
  });

  it("never calls miner_start when the setting is off (the default)", async () => {
    launch({ "mining.autoStartAtLaunch": false });
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(minerStarts()).toBe(0);
  });

  it("never calls miner_start after Cancel", async () => {
    launch();
    await vi.advanceTimersByTimeAsync(ONE_SECOND_MS);

    await handler("mining:cancelAutoStart")();
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(minerStarts()).toBe(0);
  });

  it("does not start again after the user stopped mining", async () => {
    launch();
    await vi.advanceTimersByTimeAsync(AUTO_START_DELAY_MS + ONE_SECOND_MS);
    expect(minerStarts()).toBe(1);

    await handler("mining:toggle")({}, false);
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(node.calls).toContain("miner_stop");
    expect(node.isMining).toBe(false);
    expect(minerStarts()).toBe(1);
  });
});
