import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { restartNodeByUser } from "../geth/process/nodeRestart";
import { registerSettingsHandlers } from "./settingsIpc";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock("../extension/extensionSyncServer", () => ({
  broadcastWalletState: vi.fn(),
}));
vi.mock("../geth/process/ports", () => ({ getRpcPort: () => 8545 }));
vi.mock("../geth/process/nodeRestart", () => ({
  restartNodeByUser: vi.fn(() => true),
}));

type Handler = (event: unknown, ...args: unknown[]) => unknown;

/** A store with electron-store's dotted-key get/set over a plain object. */
function createDottedStore(data: Record<string, unknown>): {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  store: Record<string, unknown>;
} {
  const get = vi.fn((key: string) =>
    key
      .split(".")
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        data,
      ),
  );
  const set = vi.fn((key: string, value: unknown) => {
    const parts = key.split(".");
    const last = parts.pop() ?? key;
    const parent = parts.reduce<Record<string, unknown>>((node, part) => {
      node[part] ??= {};
      return node[part] as Record<string, unknown>;
    }, data);
    parent[last] = value;
  });
  return { get, set, store: data };
}

function registerSet(data: Record<string, unknown> = {}): {
  setHandler: Handler;
  store: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
} {
  const handlers = new Map<string, Handler>();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as Handler);
  });
  const store = createDottedStore(data);
  registerSettingsHandlers(store);
  const setHandler = handlers.get("settings:set");
  if (!setHandler) throw new Error("settings:set was not registered");
  return { setHandler, store };
}

describe("settings:set", () => {
  it.each(["network", "network.bootnodes", "network.bootnodes.0"])(
    "refuses %s, which only the bootnode channel may write",
    (key) => {
      const { setHandler, store } = registerSet();

      expect(() => setHandler(null, key, [])).toThrow(/bootnode/);
      expect(store.set).not.toHaveBeenCalled();
    },
  );

  it("refuses an object of many keys", () => {
    const { setHandler, store } = registerSet();

    expect(() =>
      setHandler(null, { network: { bootnodes: ["x"] } }, undefined),
    ).toThrow(TypeError);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("still writes ordinary dotted keys", () => {
    const { setHandler, store } = registerSet();

    setHandler(null, "network.maxPeers", 25);

    expect(store.set).toHaveBeenCalledWith("network.maxPeers", 25);
  });
});

describe("settings:set and the running node", () => {
  beforeEach(() => {
    vi.mocked(restartNodeByUser).mockClear();
  });

  it("restarts geth when the listen port changes", () => {
    const { setHandler } = registerSet({ network: { listenPort: 30303 } });

    setHandler(null, "network.listenPort", 30310);

    expect(restartNodeByUser).toHaveBeenCalledTimes(1);
  });

  it("leaves geth running when the saved port is the same", () => {
    const { setHandler } = registerSet({ network: { listenPort: 30303 } });

    setHandler(null, "network.listenPort", 30303);

    expect(restartNodeByUser).not.toHaveBeenCalled();
  });

  it("leaves geth running for settings it does not read", () => {
    const { setHandler } = registerSet({ general: { currency: "cmu" } });

    setHandler(null, "general.currency", "usd");

    expect(restartNodeByUser).not.toHaveBeenCalled();
  });
});
