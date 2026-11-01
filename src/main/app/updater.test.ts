import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipcMain, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { killGethProcess } from "../geth/gethProcess";
import { initUpdater } from "./updater";

// The real module downloads the Electron binary on first require (#74).
vi.mock("electron", () => ({
  app: { isPackaged: false },
  ipcMain: { handle: vi.fn() },
}));
vi.mock("electron-updater", () => ({
  autoUpdater: { on: vi.fn(), quitAndInstall: vi.fn() },
}));
vi.mock("@electron-toolkit/utils", () => ({ is: { dev: false } }));
vi.mock("../geth/gethProcess", () => ({ killGethProcess: vi.fn() }));

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

describe("installing an update", () => {
  let releaseGeth: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(killGethProcess).mockReturnValue(
      new Promise<void>((resolve) => (releaseGeth = resolve)),
    );
    initUpdater(window);
  });

  it.each([
    [
      "after the download",
      () =>
        registered(
          vi.mocked(autoUpdater.on).mock.calls,
          "update-downloaded",
        )({
          version: "9.9.9",
        }),
    ],
    [
      "on the renderer's request",
      () =>
        registered(vi.mocked(ipcMain.handle).mock.calls, "updater:install")(),
    ],
  ])("stops geth first %s", async (_label, install) => {
    const installed = install();
    await Promise.resolve();

    expect(killGethProcess).toHaveBeenCalledOnce();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();

    releaseGeth();
    await installed;
    await vi.waitFor(() =>
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce(),
    );
  });
});
