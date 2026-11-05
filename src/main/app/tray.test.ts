import { describe, expect, it, vi } from "vitest";
import { buildTrayMenuTemplate, describeTrayStatus } from "./tray";
import { fillText, parseShellText } from "./shellText";
import { detectTraySupport } from "./traySupport";
import { syncPercentOf } from "../geth/rpc/nodeStatus";
import type { ShellText } from "../../bridge/types";

vi.mock("electron", () => ({}));

const TEXT: ShellText = {
  trayOpen: "Open",
  trayStartMining: "Start",
  trayStopMining: "Stop",
  trayQuit: "Quit",
  traySyncing: "Syncing {{percent}}%",
  traySynced: "Synced",
  trayOffline: "Offline",
  trayMining: "Mining",
  trayNotMining: "Idle",
  trayPeers: "Peers: {{count}}",
  quitConfirmTitle: "Quit",
  quitConfirmMessage: "Quit now?",
  quitConfirmDetail: "Mining stops.",
  quitConfirmQuit: "Quit",
  quitConfirmCancel: "Cancel",
  quitConfirmNeverAsk: "Don't ask again",
};

describe("describeTrayStatus", () => {
  it("lists sync, mining and peers", () => {
    expect(
      describeTrayStatus(
        { isOnline: true, syncPercent: 42.9, isMining: true, peers: 3 },
        TEXT,
      ),
    ).toEqual(["Syncing 42%", "Mining", "Peers: 3"]);
  });

  it("shows only offline when the node does not answer", () => {
    expect(
      describeTrayStatus(
        { isOnline: false, syncPercent: null, isMining: false, peers: null },
        TEXT,
      ),
    ).toEqual(["Offline"]);
  });
});

describe("buildTrayMenuTemplate", () => {
  const actions = (isMiningEnabled: boolean) => ({
    showWindow: vi.fn(),
    isMiningEnabled: () => isMiningEnabled,
    setMiningEnabled: vi.fn(() => Promise.resolve()),
    readStatus: vi.fn(),
    quit: vi.fn(),
  });

  it("offers the opposite mining action and wires Quit to the normal quit", () => {
    const wired = actions(true);
    const menu = buildTrayMenuTemplate(["Synced"], TEXT, wired);

    expect(menu.map((item) => item.label ?? item.type)).toEqual([
      "Synced",
      "separator",
      "Open",
      "Stop",
      "separator",
      "Quit",
    ]);
    expect(menu[0].enabled).toBe(false);
    menu[3].click?.(
      {} as Electron.MenuItem,
      undefined,
      {} as Electron.KeyboardEvent,
    );
    expect(wired.setMiningEnabled).toHaveBeenCalledWith(false);
    menu[5].click?.(
      {} as Electron.MenuItem,
      undefined,
      {} as Electron.KeyboardEvent,
    );
    expect(wired.quit).toHaveBeenCalledOnce();
  });

  it("shows the window when mining cannot start", async () => {
    const wired = {
      ...actions(false),
      setMiningEnabled: vi.fn(() => Promise.reject(new Error("no address"))),
    };
    const menu = buildTrayMenuTemplate([], TEXT, wired);

    menu
      .find((item) => item.label === "Start")
      ?.click?.(
        {} as Electron.MenuItem,
        undefined,
        {} as Electron.KeyboardEvent,
      );
    await vi.waitFor(() => expect(wired.showWindow).toHaveBeenCalledOnce());
  });
});

describe("detectTraySupport", () => {
  it("has a tray on Windows, none on macOS, and asks the bus on Linux", async () => {
    const probe = vi.fn(() => Promise.resolve(false));

    expect(await detectTraySupport("win32", probe)).toBe(true);
    expect(await detectTraySupport("darwin", probe)).toBe(false);
    expect(probe).not.toHaveBeenCalled();
    expect(await detectTraySupport("linux", probe)).toBe(false);
    expect(probe).toHaveBeenCalledOnce();
  });
});

describe("shell text", () => {
  it("accepts a complete payload and drops extra keys", () => {
    expect(parseShellText({ ...TEXT, extra: "x" })).toEqual(TEXT);
  });

  it("rejects a missing, non-string or oversized value", () => {
    expect(parseShellText({ ...TEXT, trayQuit: undefined })).toBeNull();
    expect(parseShellText({ ...TEXT, trayQuit: 1 })).toBeNull();
    expect(parseShellText({ ...TEXT, trayQuit: "x".repeat(401) })).toBeNull();
    expect(parseShellText(null)).toBeNull();
  });

  it("fills known placeholders and keeps unknown ones", () => {
    expect(fillText("{{a}} and {{b}}", { a: 1 })).toBe("1 and {{b}}");
  });
});

describe("syncPercentOf", () => {
  it("is null when synced or malformed, a percentage while syncing", () => {
    expect(syncPercentOf(false)).toBeNull();
    expect(syncPercentOf({ currentBlock: "0x0", highestBlock: "0x0" })).toBe(
      null,
    );
    expect(syncPercentOf({ currentBlock: "0x32", highestBlock: "0x64" })).toBe(
      50,
    );
  });
});
