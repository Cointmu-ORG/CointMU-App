import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { BOOTNODE_CHANNELS } from "../../bridge/ipc-channels";
import { BootnodeSaveError, BootnodeSource } from "../../bridge/types";
import { resolveBuildBootnodes } from "../geth/bootnode";
import { BOOTNODES_SETTING_KEY } from "../geth/bootnodeSettings";
import { getActiveBootnodeConfig } from "../geth/bootnodeWatcher";
import { restartNodeByUser } from "../geth/nodeRestart";
import { registerBootnodeHandlers } from "./bootnodeIpc";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock("../geth/nodeRestart", () => ({ restartNodeByUser: vi.fn() }));
vi.mock("../geth/bootnodeWatcher", async () => {
  const { resolveBuildBootnodes } = await import("../geth/bootnode");
  return {
    DEFAULT_BOOTNODE_CONFIG: resolveBuildBootnodes(undefined),
    getActiveBootnodeConfig: vi.fn(() => resolveBuildBootnodes(undefined)),
  };
});

// The secp256k1 generator point G: the public key of private key 1.
const NODE_ID =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" +
  "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
const ENODE = `enode://${NODE_ID}@10.0.0.5:30303`;
const SAVED_ENODE = `enode://${NODE_ID}@10.0.0.9:30303`;

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
  invoke: (channel: string, ...args: unknown[]) => unknown;
} {
  const handlers = new Map<string, Handler>();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as Handler);
  });
  registerBootnodeHandlers(store);
  return {
    invoke: (channel, ...args) => handlers.get(channel)?.(null, ...args),
  };
}

describe("bootnode IPC", () => {
  beforeEach(() => {
    vi.mocked(restartNodeByUser).mockReset().mockReturnValue(true);
    vi.mocked(getActiveBootnodeConfig).mockReturnValue(
      resolveBuildBootnodes(undefined),
    );
  });

  it("saves a valid list and restarts the node", () => {
    const store = createStore([]);
    const { invoke } = registerWith(store);

    const result = invoke(BOOTNODE_CHANNELS.SET, `${ENODE}\n${SAVED_ENODE}`);

    expect(store.set).toHaveBeenCalledWith(BOOTNODES_SETTING_KEY, [
      ENODE,
      SAVED_ENODE,
    ]);
    expect(restartNodeByUser).toHaveBeenCalledWith(store);
    expect(result).toEqual({
      isSaved: true,
      state: {
        activeEnodes: [ENODE, SAVED_ENODE],
        source: BootnodeSource.USER,
        customEnodes: [ENODE, SAVED_ENODE],
        isRestartPending: false,
      },
    });
  });

  it("rejects an invalid entry, keeps the saved list and does not restart", () => {
    const store = createStore([SAVED_ENODE]);
    const { invoke } = registerWith(store);

    const result = invoke(BOOTNODE_CHANNELS.SET, `${ENODE}\nenode://bad`);

    expect(result).toEqual({
      isSaved: false,
      error: BootnodeSaveError.INVALID_ENODE,
      invalid: [{ position: 2, value: "enode://bad" }],
    });
    expect(store.set).not.toHaveBeenCalled();
    expect(store.get(BOOTNODES_SETTING_KEY)).toEqual([SAVED_ENODE]);
    expect(restartNodeByUser).not.toHaveBeenCalled();
  });

  it("resets to the default bootnodes and restarts a node using custom ones", () => {
    vi.mocked(getActiveBootnodeConfig).mockReturnValue({
      enodes: [SAVED_ENODE],
      source: BootnodeSource.USER,
      problem: null,
    });
    const store = createStore([SAVED_ENODE]);
    const { invoke } = registerWith(store);

    const state = invoke(BOOTNODE_CHANNELS.RESET);

    expect(store.set).toHaveBeenCalledWith(BOOTNODES_SETTING_KEY, []);
    expect(restartNodeByUser).toHaveBeenCalledOnce();
    expect(state).toEqual({
      activeEnodes: resolveBuildBootnodes(undefined).enodes,
      source: BootnodeSource.FALLBACK,
      customEnodes: [],
      isRestartPending: false,
    });
  });

  it("does not restart on reset when the node already uses the defaults", () => {
    const store = createStore([]);
    const { invoke } = registerWith(store);

    const state = invoke(BOOTNODE_CHANNELS.RESET);

    expect(store.set).toHaveBeenCalledWith(BOOTNODES_SETTING_KEY, []);
    expect(restartNodeByUser).not.toHaveBeenCalled();
    expect(state).toMatchObject({
      source: BootnodeSource.FALLBACK,
      isRestartPending: false,
    });
  });

  it("reports the change as pending when recovery skips the restart", () => {
    vi.mocked(restartNodeByUser).mockReturnValue(false);
    const store = createStore([]);
    const { invoke } = registerWith(store);

    const result = invoke(BOOTNODE_CHANNELS.SET, ENODE);

    expect(result).toMatchObject({
      isSaved: true,
      state: { source: BootnodeSource.FALLBACK, isRestartPending: true },
    });
  });
});
