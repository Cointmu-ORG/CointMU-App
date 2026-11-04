import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "electron";
import { applyLoginItem, syncLoginItemFromOs } from "./loginItem";

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
    setLoginItemSettings: vi.fn(),
  },
}));

const REAL_PLATFORM = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform });
}

function createStore(general: Record<string, unknown>): {
  get: (key: string) => unknown;
  set: ReturnType<typeof vi.fn>;
} {
  return {
    get: (key: string) => general[key.replace("general.", "")],
    set: vi.fn(),
  };
}

describe("login item", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setPlatform(REAL_PLATFORM);
  });

  it("shows what Windows will do instead of the stored default", () => {
    setPlatform("win32");
    const store = createStore({ launchAtLogin: true, openInBackground: true });

    syncLoginItemFromOs(store);

    expect(app.getLoginItemSettings).toHaveBeenCalledWith({
      args: ["--open-in-background"],
    });
    expect(store.set).toHaveBeenCalledWith("general.launchAtLogin", false);
  });

  it("registers the background argument on Windows only", () => {
    const store = createStore({ launchAtLogin: true, openInBackground: true });

    setPlatform("win32");
    applyLoginItem(store);
    setPlatform("darwin");
    applyLoginItem(store);

    expect(vi.mocked(app.setLoginItemSettings).mock.calls).toEqual([
      [{ openAtLogin: true, args: ["--open-in-background"] }],
      [{ openAtLogin: true, args: [] }],
    ]);
  });

  it("leaves Linux alone", () => {
    setPlatform("linux");
    const store = createStore({ launchAtLogin: true, openInBackground: false });

    syncLoginItemFromOs(store);
    applyLoginItem(store);

    expect(app.getLoginItemSettings).not.toHaveBeenCalled();
    expect(app.setLoginItemSettings).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });
});
