import { beforeEach, describe, expect, it, vi } from "vitest";
import { app, powerMonitor } from "electron";
import { killGethProcess } from "../geth/process/gethProcess";
import { confirmQuitIfBusy, type QuitAnswer } from "./quitConfirmation";

vi.mock("electron", () => ({
  app: {
    on: vi.fn(),
    quit: vi.fn(),
    exit: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  powerMonitor: { on: vi.fn() },
  dialog: {},
}));
vi.mock("../geth/process/gethProcess", () => ({
  killGethProcess: vi.fn(() => Promise.resolve()),
}));
vi.mock("../geth/process/ipcEndpointLifecycle", () => ({
  removeTemporaryIpcDir: vi.fn(() => Promise.resolve()),
}));
vi.mock("../geth/rpc/nodeStatus", () => ({ readNodeStatus: vi.fn() }));

type Handler = (...args: unknown[]) => void;

/** Loads a fresh appQuit (module state) and returns its electron handlers. */
async function load() {
  vi.resetModules();
  vi.mocked(app.on).mockClear();
  vi.mocked(powerMonitor.on).mockClear();
  const quit = await import("./appQuit");
  quit.registerQuitHandler();
  await Promise.resolve();
  const handler = (calls: unknown[][], name: string): Handler =>
    calls.find(([event]) => event === name)?.[1] as Handler;
  const preventDefault = vi.fn();
  return {
    quit,
    preventDefault,
    beforeQuit: () =>
      handler(vi.mocked(app.on).mock.calls, "before-quit")({ preventDefault }),
    sessionEnd: () => quit.quitForSessionEnd(),
    shutdown: () =>
      handler(
        vi.mocked(powerMonitor.on).mock.calls,
        "shutdown",
      )({
        preventDefault,
      }),
  };
}

describe("quit", () => {
  beforeEach(() => {
    vi.mocked(killGethProcess).mockClear();
    vi.mocked(app.exit).mockClear();
  });

  it("stays open when the user declines, and quits on the next confirmed try", async () => {
    const { quit, beforeQuit, preventDefault } = await load();
    const confirm = vi.fn(() => Promise.resolve(false));
    quit.setQuitConfirmation(confirm);

    beforeQuit();
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    await Promise.resolve();

    expect(preventDefault).toHaveBeenCalled();
    expect(killGethProcess).not.toHaveBeenCalled();
    expect(quit.isQuitInProgress()).toBe(false);

    confirm.mockResolvedValue(true);
    beforeQuit();
    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledOnce());
    expect(killGethProcess).toHaveBeenCalledOnce();
  });

  it("does not ask during an updater install", async () => {
    const { quit, beforeQuit } = await load();
    const confirm = vi.fn(() => Promise.resolve(false));
    quit.setQuitConfirmation(confirm);

    quit.markQuitReason(quit.QuitReason.UPDATER);
    beforeQuit();

    expect(quit.isQuitInProgress()).toBe(true);
    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledOnce());
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    ["Windows session-end (on the window)", "sessionEnd"],
    ["Linux/macOS shutdown", "shutdown"],
  ] as const)("does not ask on %s", async (_label, event) => {
    const loaded = await load();
    const confirm = vi.fn(() => Promise.resolve(false));
    loaded.quit.setQuitConfirmation(confirm);

    loaded[event]();
    expect(app.quit).toHaveBeenCalled();
    loaded.beforeQuit();

    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledOnce());
    expect(confirm).not.toHaveBeenCalled();
    expect(killGethProcess).toHaveBeenCalledOnce();
  });

  it("lets an OS shutdown through while the question is still open", async () => {
    const { quit, beforeQuit, sessionEnd } = await load();
    quit.setQuitConfirmation(() => new Promise<boolean>(() => {}));

    beforeQuit();
    sessionEnd();
    beforeQuit();

    await vi.waitFor(() => expect(app.exit).toHaveBeenCalledOnce());
  });
});

describe("confirmQuitIfBusy", () => {
  const deps = (overrides: {
    isEnabled?: boolean;
    isBusy?: boolean;
    answer?: QuitAnswer;
  }) => ({
    isEnabled: () => overrides.isEnabled ?? true,
    isBusy: vi.fn(() => Promise.resolve(overrides.isBusy ?? true)),
    ask: vi.fn(() =>
      Promise.resolve(
        overrides.answer ?? { isConfirmed: true, isNeverAskChecked: false },
      ),
    ),
    disable: vi.fn(),
  });

  it("quits without asking when the setting is off or the node is idle", async () => {
    const off = deps({ isEnabled: false });
    const idle = deps({ isBusy: false });

    expect(await confirmQuitIfBusy(off)).toBe(true);
    expect(await confirmQuitIfBusy(idle)).toBe(true);
    expect(off.isBusy).not.toHaveBeenCalled();
    expect(idle.ask).not.toHaveBeenCalled();
  });

  it("asks while busy and follows the answer", async () => {
    const declined = deps({
      answer: { isConfirmed: false, isNeverAskChecked: true },
    });

    expect(await confirmQuitIfBusy(declined)).toBe(false);
    expect(declined.disable).not.toHaveBeenCalled();
  });

  it("turns the question off when confirmed with Don't ask again", async () => {
    const neverAsk = deps({
      answer: { isConfirmed: true, isNeverAskChecked: true },
    });

    expect(await confirmQuitIfBusy(neverAsk)).toBe(true);
    expect(neverAsk.disable).toHaveBeenCalledOnce();
  });
});
