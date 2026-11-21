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

  it("saves a valid address name map and refuses a single-name write", () => {
    const address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const data: Record<string, unknown> = {};
    const { setHandler, store } = registerSet(data);

    setHandler(null, "addressNames", { [address]: "Alice" });
    expect(() => setHandler(null, `addressNames.${address}`, "\u0000")).toThrow(
      /addressNames/,
    );

    expect(store.set).toHaveBeenCalledTimes(1);
    expect(data.addressNames).toEqual({ [address]: "Alice" });
  });

  describe("accounts", () => {
    const ADDRESS_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const ADDRESS_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    it("saves accounts whose labels are valid names", () => {
      const data: Record<string, unknown> = {};
      const { setHandler } = registerSet(data);
      const accounts = [{ index: 0, address: ADDRESS_A, label: "Main 🚀" }];

      setHandler(null, "accounts", accounts);

      expect(data.accounts).toEqual(accounts);
    });

    it.each([
      ["a right-to-left override", "Main\u202E"],
      ["a control character", "Ma\u0000in"],
      ["surrounding spaces", " Main"],
      ["no text", ""],
      ["a non-string", 7],
    ])("refuses a new label with %s", (_, label) => {
      const { setHandler, store } = registerSet();

      expect(() =>
        setHandler(null, "accounts", [{ index: 0, address: ADDRESS_A, label }]),
      ).toThrow(/accounts/);
      expect(store.set).not.toHaveBeenCalled();
    });

    it("keeps an already stored label that fails the check, so old accounts still save", () => {
      const oldLabel = "Импортированный аккаунт из Seed-фразы";
      const data: Record<string, unknown> = {
        accounts: [{ index: 0, address: ADDRESS_A, label: oldLabel }],
      };
      const { setHandler } = registerSet(data);
      const next = [
        { index: 0, address: ADDRESS_A, label: oldLabel, isHidden: true },
        { index: 1, address: ADDRESS_B, label: "Account 2" },
      ];

      setHandler(null, "accounts", next);

      expect(data.accounts).toEqual(next);
    });

    it("refuses renaming a stored account to an invalid label", () => {
      const data: Record<string, unknown> = {
        accounts: [{ index: 0, address: ADDRESS_A, label: "Main" }],
      };
      const { setHandler, store } = registerSet(data);

      expect(() =>
        setHandler(null, "accounts", [
          { index: 0, address: ADDRESS_A, label: "Ma\u2066in" },
        ]),
      ).toThrow(/accounts/);
      expect(store.set).not.toHaveBeenCalled();
    });

    it("refuses a write below accounts, which would skip the label check", () => {
      const { setHandler, store } = registerSet({ accounts: [] });

      expect(() => setHandler(null, "accounts.0.label", "\u202E")).toThrow(
        /accounts/,
      );
      expect(store.set).not.toHaveBeenCalled();
    });
  });

  it("refuses the chain data folder, which only the move may write", () => {
    const { setHandler, store } = registerSet();

    expect(() => setHandler(null, "chainDataRoot", "/tmp/x")).toThrow(/move/);
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
