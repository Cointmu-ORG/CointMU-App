import { beforeEach, describe, expect, it, vi } from "vitest";
import { app, ipcMain, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { killGethProcess } from "../geth/process/gethProcess";
import { initUpdater } from "./updater";
import { markQuitReason, setQuitFinisher } from "./appQuit";

// The real module downloads the Electron binary on first require (#74).
vi.mock("electron", () => ({
  app: { isPackaged: false, exit: vi.fn() },
  ipcMain: { handle: vi.fn() },
}));
vi.mock("electron-updater", () => ({
  autoUpdater: {
    on: vi.fn(),
    quitAndInstall: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock("@electron-toolkit/utils", () => ({ is: { dev: false } }));
vi.mock("../geth/process/gethProcess", () => ({ killGethProcess: vi.fn() }));
vi.mock("./appQuit", () => ({
  QuitReason: { UPDATER: "updater" },
  markQuitReason: vi.fn(),
  setQuitFinisher: vi.fn(),
}));

const window = {
  isDestroyed: () => false,
  webContents: { send: vi.fn() },
} as unknown as BrowserWindow;

type Listener = (...args: unknown[]) => unknown;

function registered(calls: unknown[][], name: string): Listener {
  const call = calls.find(([event]) => event === name);
  if (!call) throw new Error(`${name} is not registered`);
  return call[1] as Listener;
}

function storeWith(updates: Record<string, unknown>) {
  return {
    get: vi.fn((key: string) => updates[key.replace("updates.", "")]),
  };
}

const download = (): unknown =>
  registered(
    vi.mocked(autoUpdater.on).mock.calls,
    "update-downloaded",
  )({
    version: "9.9.9",
  });

const finishQuit = (): void => {
  const finisher = vi.mocked(setQuitFinisher).mock.calls[0]?.[0];
  if (!finisher) throw new Error("no quit finisher was set");
  finisher();
};

describe("installing an update", () => {
  let releaseGeth: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(killGethProcess).mockReturnValue(
      new Promise<void>((resolve) => (releaseGeth = resolve)),
    );
  });

  it("stops geth first on the renderer's request (Restart now)", async () => {
    initUpdater(window, storeWith({ installMode: "ask" }));
    const installed = registered(
      vi.mocked(ipcMain.handle).mock.calls,
      "updater:install",
    )();
    await Promise.resolve();

    expect(killGethProcess).toHaveBeenCalledOnce();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    // Its quit must skip the "quit while mining?" question.
    expect(markQuitReason).toHaveBeenCalledWith("updater");

    releaseGeth();
    await installed;
    await vi.waitFor(() =>
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce(),
    );
  });

  it.each([
    ["on-quit", false],
    ["ask", true],
  ])(
    "waits after the download in mode %s (prompt: %s)",
    (installMode, shouldAsk) => {
      initUpdater(window, storeWith({ installMode }));

      download();

      expect(killGethProcess).not.toHaveBeenCalled();
      expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
      expect(window.webContents.send).toHaveBeenCalledWith(
        "updater:state",
        expect.objectContaining({
          status: "downloaded",
          shouldAskToInstall: shouldAsk,
        }),
      );
    },
  );

  it("installs a downloaded update silently, without relaunch, at quit in mode on-quit", () => {
    initUpdater(window, storeWith({ installMode: "on-quit" }));
    download();

    finishQuit();

    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, false);
    expect(app.exit).not.toHaveBeenCalled();
  });

  it.each([
    ["no update was downloaded", "on-quit", false],
    ["the mode is ask", "ask", true],
  ])("just exits at quit when %s", (_label, installMode, isDownloaded) => {
    initUpdater(window, storeWith({ installMode }));
    if (isDownloaded) download();

    finishQuit();

    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalledOnce();
  });
});

describe("checking for updates at start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(app, { isPackaged: true });
  });

  it("checks when automatic checks are on", () => {
    initUpdater(window, storeWith({ autoCheck: true }));

    expect(autoUpdater.checkForUpdatesAndNotify).toHaveBeenCalledOnce();
  });

  it("does not check when they are off", () => {
    initUpdater(window, storeWith({ autoCheck: false }));

    expect(autoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });
});
