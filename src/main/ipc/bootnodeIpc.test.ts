import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { SigningKey, toBeHex } from "ethers";
import { BOOTNODE_CHANNELS } from "../../bridge/ipc-channels";
import { BootnodeSaveError, BootnodeSource } from "../../bridge/types";
import {
  FALLBACK_BOOTNODE_ENODES,
  resolveBuildBootnodes,
} from "../geth/bootnode/bootnode";
import {
  BOOTNODES_SETTING_KEY,
  EMPTY_BOOTNODE_SETTINGS,
} from "../geth/bootnode/bootnodeSettings";
import { getActiveBootnodeConfig } from "../geth/bootnode/bootnodeWatcher";
import { syncStaticPeers } from "../geth/bootnode/staticPeers";
import { probeBootnodes } from "../geth/bootnode/bootnodeStatus";
import { restartNodeByUser } from "../geth/process/nodeRestart";
import { registerBootnodeHandlers } from "./bootnodeIpc";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock("../geth/process/nodeRestart", () => ({ restartNodeByUser: vi.fn() }));
vi.mock("../geth/bootnode/staticPeers", () => ({ syncStaticPeers: vi.fn() }));
vi.mock("../geth/bootnode/bootnodeStatus", () => ({
  LIVE_PROBE_DEPS: {},
  probeBootnodes: vi.fn(async () => []),
}));
vi.mock("../geth/bootnode/bootnodeWatcher", async () => {
  const { resolveBuildBootnodes } = await import("../geth/bootnode/bootnode");
  const { BOOTNODES_SETTING_KEY } =
    await import("../geth/bootnode/bootnodeSettings");
  const { resolveBootnodeConfig } =
    await import("../geth/bootnode/bootnodeState");
  const defaults = resolveBuildBootnodes(undefined);
  return {
    DEFAULT_BOOTNODE_CONFIG: defaults,
    getActiveBootnodeConfig: vi.fn(),
    getBootnodeConfig: (store: { get: (key: string) => unknown }) =>
      resolveBootnodeConfig(store.get(BOOTNODES_SETTING_KEY), defaults),
  };
});

const DEFAULTS = FALLBACK_BOOTNODE_ENODES;
const CUSTOM = `enode://${new SigningKey(toBeHex(1, 32)).publicKey.slice(4)}@10.0.0.5:30303`;
const WITH_CUSTOM = { custom: [{ enode: CUSTOM, label: "Lab" }], disabled: [] };

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function createStore(initial: unknown): {
  get: (key: string) => unknown;
  set: ReturnType<typeof vi.fn>;
} {
  const values = new Map<string, unknown>([[BOOTNODES_SETTING_KEY, initial]]);
  return {
    get: (key) => values.get(key),
    set: vi.fn((key: string, value: unknown) => values.set(key, value)),
  };
}

function registerWith(store: ReturnType<typeof createStore>): {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
} {
  const handlers = new Map<string, Handler>();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as Handler);
  });
  registerBootnodeHandlers(store);
  store.set.mockClear();
  return {
    invoke: async (channel, ...args) => handlers.get(channel)?.(null, ...args),
  };
}

describe("bootnode IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(restartNodeByUser).mockReturnValue(true);
    vi.mocked(getActiveBootnodeConfig).mockReturnValue(
      resolveBuildBootnodes(undefined),
    );
  });

  it("migrates a #70 list when the handlers are registered", () => {
    const store = createStore([CUSTOM]);

    registerWith(store);

    expect(store.get(BOOTNODES_SETTING_KEY)).toEqual({
      custom: [{ enode: CUSTOM, label: "" }],
      disabled: [],
    });
  });

  it("adds a node as a static peer without restarting", async () => {
    const store = createStore(EMPTY_BOOTNODE_SETTINGS);
    const { invoke } = registerWith(store);

    const result = await invoke(BOOTNODE_CHANNELS.SET, WITH_CUSTOM);

    expect(store.set).toHaveBeenCalledWith(BOOTNODES_SETTING_KEY, WITH_CUSTOM);
    expect(restartNodeByUser).not.toHaveBeenCalled();
    expect(syncStaticPeers).toHaveBeenCalledWith([...DEFAULTS, CUSTOM]);
    expect(result).toMatchObject({
      isSaved: true,
      state: { source: BootnodeSource.USER, isRestartPending: false },
    });
  });

  it("restarts when a running bootnode is disabled", async () => {
    const store = createStore(EMPTY_BOOTNODE_SETTINGS);
    const { invoke } = registerWith(store);

    const result = await invoke(BOOTNODE_CHANNELS.SET, {
      custom: [],
      disabled: [DEFAULTS[1]],
    });

    expect(restartNodeByUser).toHaveBeenCalledWith(store);
    expect(syncStaticPeers).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      isSaved: true,
      state: { isRestartPending: false },
    });
  });

  it("removes the node live and reports pending when recovery skips the restart", async () => {
    vi.mocked(restartNodeByUser).mockReturnValue(false);
    const store = createStore(EMPTY_BOOTNODE_SETTINGS);
    const { invoke } = registerWith(store);

    const result = await invoke(BOOTNODE_CHANNELS.SET, {
      custom: [],
      disabled: [DEFAULTS[1]],
    });

    expect(syncStaticPeers).toHaveBeenCalledWith([DEFAULTS[0], DEFAULTS[2]]);
    expect(result).toMatchObject({ state: { isRestartPending: true } });
  });

  it.each([
    [
      "a duplicate",
      { custom: [{ enode: DEFAULTS[0], label: "" }], disabled: [] },
      BootnodeSaveError.DUPLICATE,
    ],
    [
      "a bad enode",
      { custom: [{ enode: "enode://bad", label: "" }], disabled: [] },
      BootnodeSaveError.INVALID_ENODE,
    ],
    ["the #70 text payload", CUSTOM, BootnodeSaveError.INVALID_ENODE],
  ])("rejects %s and keeps the saved setting", async (_, payload, error) => {
    const store = createStore(WITH_CUSTOM);
    const { invoke } = registerWith(store);

    const result = await invoke(BOOTNODE_CHANNELS.SET, payload);

    expect(result).toEqual({ isSaved: false, error });
    expect(store.set).not.toHaveBeenCalled();
    expect(restartNodeByUser).not.toHaveBeenCalled();
  });

  it("resets to the defaults without a restart when nothing running is removed", async () => {
    const store = createStore(WITH_CUSTOM);
    const { invoke } = registerWith(store);

    const state = await invoke(BOOTNODE_CHANNELS.RESET);

    expect(store.set).toHaveBeenCalledWith(
      BOOTNODES_SETTING_KEY,
      EMPTY_BOOTNODE_SETTINGS,
    );
    expect(restartNodeByUser).not.toHaveBeenCalled();
    expect(syncStaticPeers).toHaveBeenCalledWith(DEFAULTS);
    expect(state).toMatchObject({
      source: BootnodeSource.FALLBACK,
      isRestartPending: false,
    });
  });

  it("restarts on reset when the running node uses a custom bootnode", async () => {
    vi.mocked(getActiveBootnodeConfig).mockReturnValue({
      enodes: [...DEFAULTS, CUSTOM],
      source: BootnodeSource.USER,
      problem: null,
    });
    const store = createStore(WITH_CUSTOM);
    const { invoke } = registerWith(store);

    await invoke(BOOTNODE_CHANNELS.RESET);

    expect(restartNodeByUser).toHaveBeenCalledOnce();
  });

  it("probes only listed nodes", async () => {
    const store = createStore(WITH_CUSTOM);
    const { invoke } = registerWith(store);

    await invoke(BOOTNODE_CHANNELS.PROBE);
    await invoke(BOOTNODE_CHANNELS.PROBE, CUSTOM);
    await invoke(BOOTNODE_CHANNELS.PROBE, "enode://x@10.0.0.1:22");

    const targets = vi
      .mocked(probeBootnodes)
      .mock.calls.map(([enodes]) => enodes);
    expect(targets).toEqual([[...DEFAULTS, CUSTOM], [CUSTOM], []]);
  });
});
