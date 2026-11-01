import { describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { registerSettingsHandlers } from "./settingsIpc";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock("../extension/extensionSyncServer", () => ({
  broadcastWalletState: vi.fn(),
}));
vi.mock("../geth/process/ports", () => ({ getRpcPort: () => 8545 }));

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function registerSet(): {
  setHandler: Handler;
  store: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
} {
  const handlers = new Map<string, Handler>();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as Handler);
  });
  const store = { get: vi.fn(), set: vi.fn(), store: {} };
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
