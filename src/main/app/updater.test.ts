import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app, ipcMain, shell, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { killGethProcess } from "../geth/process/gethProcess";
import { initUpdater } from "./updater";
import { markQuitReason, setQuitFinisher } from "./appQuit";

// The real module downloads the Electron binary on first require (#74).
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    exit: vi.fn(),
    getVersion: vi.fn(() => "1.9.3"),
    getPath: vi.fn(),
  },
  ipcMain: { handle: vi.fn() },
  shell: { openExternal: vi.fn(() => Promise.resolve()) },
}));
vi.mock("electron-updater", () => ({
  autoUpdater: {
    on: vi.fn(),
    quitAndInstall: vi.fn(),
    checkForUpdates: vi.fn(() => Promise.resolve()),
    checkForUpdatesAndNotify: vi.fn(() => Promise.resolve()),
    downloadUpdate: vi.fn(() => Promise.resolve()),
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

const REAL_PLATFORM = process.platform;
const onPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, "platform", { value: platform });
};

// The auto-update tests below hold on Windows and Linux; macOS has its own.
beforeEach(() => onPlatform("linux"));
afterEach(() => {
  onPlatform(REAL_PLATFORM);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

const LATEST_RELEASE_API =
  "https://api.github.com/repos/Cointmu-ORG/CointMU-App/releases/latest";
const UPDATER_SETTINGS = [
  "autoDownload",
  "autoInstallOnAppQuit",
  "allowPrerelease",
  "allowDowngrade",
  "forceDevUpdateConfig",
  "logger",
] as const;

/** Stubs fetch to answer the latest-release request with this tag. */
function latestReleaseIs(tag: string): ReturnType<typeof vi.fn> {
  const fetchRelease = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ tag_name: tag, draft: false, prerelease: false }),
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchRelease);
  return fetchRelease;
}

const handler = (name: string): Listener =>
  registered(vi.mocked(ipcMain.handle).mock.calls, name);

const updaterStates = (): unknown[] =>
  vi
    .mocked(window.webContents.send)
    .mock.calls.filter(([channel]) => channel === "updater:state")
    .map(([, payload]) => payload);

function expectElectronUpdaterUntouched(): void {
  expect(autoUpdater.on).not.toHaveBeenCalled();
  expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  expect(autoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  for (const setting of UPDATER_SETTINGS) {
    expect(autoUpdater).not.toHaveProperty(setting);
  }
}

describe("updates on a macOS build that is not notarized (#164)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const setting of UPDATER_SETTINGS) {
      Reflect.deleteProperty(autoUpdater, setting);
    }
    onPlatform("darwin");
    Object.assign(app, { isPackaged: true });
  });

  it("checks the latest GitHub release and tells the renderer, without electron-updater", async () => {
    const fetchRelease = latestReleaseIs("v9.9.9");

    initUpdater(window, storeWith({ autoCheck: true }));

    await vi.waitFor(() =>
      expect(updaterStates()).toContainEqual({
        status: "available",
        info: { version: "9.9.9" },
        isManualInstall: true,
      }),
    );
    expect(fetchRelease).toHaveBeenCalledWith(
      LATEST_RELEASE_API,
      expect.anything(),
    );
    expectElectronUpdaterUntouched();
  });

  it("is the mode unless the build says MAIN_VITE_MAC_NOTARIZED=true", async () => {
    vi.stubEnv("MAIN_VITE_MAC_NOTARIZED", "false");
    latestReleaseIs("v9.9.9");

    initUpdater(window, storeWith({ autoCheck: true }));

    await vi.waitFor(() =>
      expect(updaterStates()).toContainEqual(
        expect.objectContaining({ status: "available" }),
      ),
    );
    expectElectronUpdaterUntouched();
  });

  it("opens the release's page, and nothing else, from the notice", async () => {
    latestReleaseIs("v9.9.9");
    initUpdater(window, storeWith({ autoCheck: true }));
    await vi.waitFor(() => expect(updaterStates()).toHaveLength(2));

    await handler("updater:openReleasePage")("https://evil.example/");

    expect(shell.openExternal).toHaveBeenCalledExactlyOnceWith(
      "https://github.com/Cointmu-ORG/CointMU-App/releases/tag/v9.9.9",
    );
  });

  it("opens the latest-release page before a check found one", async () => {
    initUpdater(window, storeWith({ autoCheck: false }));

    await handler("updater:openReleasePage")();

    expect(shell.openExternal).toHaveBeenCalledExactlyOnceWith(
      "https://github.com/Cointmu-ORG/CointMU-App/releases/latest",
    );
  });

  it("never builds a page from a tag that is not vX.Y.Z", async () => {
    latestReleaseIs("v9.9.9/../../../evil");
    initUpdater(window, storeWith({ autoCheck: true }));
    await vi.waitFor(() =>
      expect(updaterStates()).toContainEqual(
        expect.objectContaining({ status: "error" }),
      ),
    );

    await handler("updater:openReleasePage")();

    expect(shell.openExternal).toHaveBeenCalledExactlyOnceWith(
      "https://github.com/Cointmu-ORG/CointMU-App/releases/latest",
    );
  });

  it("says so when the running version is the latest", async () => {
    latestReleaseIs("v1.9.3");

    initUpdater(window, storeWith({ autoCheck: true }));

    await vi.waitFor(() =>
      expect(updaterStates()).toEqual([
        { status: "checking" },
        { status: "not-available" },
      ]),
    );
  });

  it("reports a failed check without reading any app path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("fetch failed"))),
    );

    initUpdater(window, storeWith({ autoCheck: true }));

    await vi.waitFor(() =>
      expect(updaterStates()).toContainEqual({
        status: "error",
        error: "fetch failed",
      }),
    );
    // userData, the chain data and the keystores all live under app paths.
    expect(app.getPath).not.toHaveBeenCalled();
    expectElectronUpdaterUntouched();
  });

  it("does not check at start when automatic checks are off", () => {
    const fetchRelease = latestReleaseIs("v9.9.9");

    initUpdater(window, storeWith({ autoCheck: false }));

    expect(fetchRelease).not.toHaveBeenCalled();
    expect(updaterStates()).toEqual([]);
  });

  it("checks on the renderer's request", async () => {
    const fetchRelease = latestReleaseIs("v9.9.9");
    initUpdater(window, storeWith({ autoCheck: false }));

    await handler("updater:check")();

    expect(fetchRelease).toHaveBeenCalledOnce();
    expect(updaterStates()).toContainEqual(
      expect.objectContaining({ status: "available" }),
    );
    expectElectronUpdaterUntouched();
  });

  it("ignores download and install requests", async () => {
    initUpdater(window, storeWith({ autoCheck: false }));

    await handler("updater:download")();
    await handler("updater:install")();

    expectElectronUpdaterUntouched();
    expect(killGethProcess).not.toHaveBeenCalled();
    expect(markQuitReason).not.toHaveBeenCalled();
  });

  it("just exits at quit", () => {
    initUpdater(window, storeWith({ installMode: "on-quit" }));

    finishQuit();

    expect(app.exit).toHaveBeenCalledOnce();
    expectElectronUpdaterUntouched();
  });
});

describe("auto-update stays on where it works", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(app, { isPackaged: true });
  });

  it.each(["win32", "linux"] as const)(
    "%s downloads automatically and never asks GitHub's API",
    (platform) => {
      onPlatform(platform);
      const fetchRelease = latestReleaseIs("v9.9.9");

      initUpdater(window, storeWith({ autoCheck: true }));

      expect(autoUpdater).toHaveProperty("autoDownload", true);
      expect(autoUpdater).toHaveProperty("autoInstallOnAppQuit", false);
      expect(autoUpdater.checkForUpdatesAndNotify).toHaveBeenCalledOnce();
      expect(fetchRelease).not.toHaveBeenCalled();
      expect(() => handler("updater:openReleasePage")).toThrow(
        /not registered/,
      );
    },
  );

  it("a notarized macOS build (MAIN_VITE_MAC_NOTARIZED=true) auto-updates too", () => {
    onPlatform("darwin");
    vi.stubEnv("MAIN_VITE_MAC_NOTARIZED", "true");
    const fetchRelease = latestReleaseIs("v9.9.9");

    initUpdater(window, storeWith({ autoCheck: true }));

    expect(autoUpdater).toHaveProperty("autoDownload", true);
    expect(autoUpdater.checkForUpdatesAndNotify).toHaveBeenCalledOnce();
    expect(fetchRelease).not.toHaveBeenCalled();
  });
});
