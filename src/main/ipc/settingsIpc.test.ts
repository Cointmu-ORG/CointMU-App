import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { restartNodeByUser } from "../geth/process/nodeRestart";
import { applyLoginItem } from "../app/loginItem";
import { registerSettingsHandlers } from "./settingsIpc";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock("../extension/extensionSyncServer", () => ({
  broadcastWalletState: vi.fn(),
}));
vi.mock("../geth/process/ports", () => ({ getRpcPort: () => 8545 }));
vi.mock("../geth/process/nodeRestart", () => ({
  restartNodeByUser: vi.fn(() => true),
}));
vi.mock("../app/loginItem", () => ({ applyLoginItem: vi.fn() }));

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
  return {
    get,
    set,
    // electron-store replaces the whole content on assignment.
    get store(): Record<string, unknown> {
      return data;
    },
    set store(next: Record<string, unknown>) {
      for (const key of Object.keys(data)) delete data[key];
      Object.assign(data, next);
    },
  };
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

  it("refuses a value a setting rule rejects, alone or in a section", () => {
    const { setHandler, store } = registerSet();

    expect(() => setHandler(null, "general.closeAction", "explode")).toThrow(
      /general\.closeAction/,
    );
    expect(() =>
      setHandler(null, "general", { closeAction: "explode" }),
    ).toThrow(TypeError);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("restores ruled defaults a whole-section write left out", () => {
    const data: Record<string, unknown> = {
      general: { closeAction: "tray", currency: "usd" },
    };
    const { setHandler } = registerSet(data);

    setHandler(null, "general", { currency: "cmu" });

    expect(data.general).toMatchObject({
      currency: "cmu",
      closeAction: "quit",
    });
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
    vi.mocked(applyLoginItem).mockClear();
  });

  it("restarts geth when the listen port changes", () => {
    const { setHandler } = registerSet({ network: { listenPort: 30303 } });

    setHandler(null, "network.listenPort", 30310);

    expect(restartNodeByUser).toHaveBeenCalledTimes(1);
  });

  it("restarts geth when Max peers changes", () => {
    const { setHandler } = registerSet({ network: { maxPeers: 14 } });

    setHandler(null, "network.maxPeers", 25);

    expect(restartNodeByUser).toHaveBeenCalledTimes(1);
  });

  it("restarts geth when the advanced section is saved with a new log level", () => {
    const { setHandler } = registerSet({
      advanced: { httpRpc: true, logLevel: "info" },
    });

    setHandler(null, "advanced", { httpRpc: true, logLevel: "debug" });

    expect(restartNodeByUser).toHaveBeenCalledTimes(1);
  });

  it("writes the login item when Launch at login changes, without a restart", () => {
    const { setHandler } = registerSet({ general: { launchAtLogin: false } });

    setHandler(null, "general.launchAtLogin", true);

    expect(applyLoginItem).toHaveBeenCalledTimes(1);
    expect(restartNodeByUser).not.toHaveBeenCalled();
  });

  it("leaves geth running when the saved port is the same", () => {
    const { setHandler } = registerSet({ network: { listenPort: 30303 } });

    setHandler(null, "network.listenPort", 30303);

    expect(restartNodeByUser).not.toHaveBeenCalled();
  });

  it("leaves geth and the login item alone for other settings", () => {
    const { setHandler } = registerSet({ general: { currency: "cmu" } });

    setHandler(null, "general.currency", "usd");

    expect(restartNodeByUser).not.toHaveBeenCalled();
    expect(applyLoginItem).not.toHaveBeenCalled();
  });
});
