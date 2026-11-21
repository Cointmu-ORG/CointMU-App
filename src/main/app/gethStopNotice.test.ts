import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NODE_CHANNELS } from "../../bridge/ipc-channels";
import {
  GETH_READY_LOG,
  GETH_READY_MARGIN_MS,
  GETH_READY_WAIT_MS,
  createGethReadiness,
} from "../geth/process/gethReadiness";
import { stopProcess } from "../geth/process/gethStop";
import { STOP_WAIT_NOTICE_DELAY_MS } from "../geth/process/gethStopWait";
import { showGethStopWait } from "./gethStopNotice";

const sessionEnd = vi.hoisted(() => ({ isEnding: false }));

vi.mock("electron", () => ({}));
vi.mock("./appQuit", () => ({ isSessionEnding: () => sessionEnd.isEnding }));
vi.mock("./tray", () => ({ setTrayStopWaiting: vi.fn() }));
vi.mock("./traySetup", () => ({ showWindow: vi.fn() }));

const { setTrayStopWaiting } = await import("./tray");
const { showWindow } = await import("./traySetup");

const REPAIR_MS = 60_000;

function fakeGeth(): { proc: ChildProcess; kill: ReturnType<typeof vi.fn> } {
  const kill = vi.fn(() => true);
  const proc = Object.assign(new EventEmitter(), {
    kill,
    stdin: null,
  }) as unknown as ChildProcess;
  return { proc, kill };
}

function fakeWindow(isVisible: boolean): {
  win: BrowserWindow;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn();
  const win = {
    isDestroyed: () => false,
    isVisible: () => isVisible,
    isMinimized: () => false,
    webContents: { send },
  } as unknown as BrowserWindow;
  return { win, send };
}

function stopWaitEvents(send: ReturnType<typeof vi.fn>): unknown[] {
  return send.mock.calls
    .filter(([channel]) => channel === NODE_CHANNELS.STOP_WAIT)
    .map(([, wait]) => wait);
}

describe("showGethStopWait", () => {
  const realPlatform = process.platform;
  let stopShowing: () => void = () => undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sessionEnd.isEnding = false;
    Object.defineProperty(process, "platform", { value: "linux" });
  });

  afterEach(() => {
    stopShowing();
    vi.useRealTimers();
    Object.defineProperty(process, "platform", { value: realPlatform });
  });

  it("tells the renderer while a stop waits, and ends once geth is interrupted", async () => {
    const { win, send } = fakeWindow(true);
    stopShowing = showGethStopWait(win);
    const { proc, kill } = fakeGeth();
    const readiness = createGethReadiness();
    const startedAt = Date.now();

    void stopProcess(proc, readiness);
    await vi.advanceTimersByTimeAsync(STOP_WAIT_NOTICE_DELAY_MS);
    expect(stopWaitEvents(send)).toEqual([
      { startedAt, maxWaitMs: GETH_READY_WAIT_MS },
    ]);
    expect(setTrayStopWaiting).toHaveBeenLastCalledWith(true);

    await vi.advanceTimersByTimeAsync(REPAIR_MS);
    readiness.observe(`INFO ${GETH_READY_LOG}`);
    await vi.advanceTimersByTimeAsync(GETH_READY_MARGIN_MS);

    expect(kill).toHaveBeenCalledWith("SIGINT");
    expect(stopWaitEvents(send)).toEqual([
      { startedAt, maxWaitMs: GETH_READY_WAIT_MS },
      null,
    ]);
    expect(setTrayStopWaiting).toHaveBeenLastCalledWith(false);
  });

  it("stays quiet when geth is ready before the notice delay", async () => {
    const { win, send } = fakeWindow(true);
    stopShowing = showGethStopWait(win);
    const { proc, kill } = fakeGeth();
    const readiness = createGethReadiness();

    void stopProcess(proc, readiness);
    readiness.observe(`INFO ${GETH_READY_LOG}`);
    await vi.advanceTimersByTimeAsync(STOP_WAIT_NOTICE_DELAY_MS);

    expect(kill).toHaveBeenCalledWith("SIGINT");
    expect(stopWaitEvents(send)).toEqual([]);
  });

  it("brings up a window hidden in the tray", async () => {
    const { win } = fakeWindow(false);
    stopShowing = showGethStopWait(win);

    void stopProcess(fakeGeth().proc, createGethReadiness());
    await vi.advanceTimersByTimeAsync(STOP_WAIT_NOTICE_DELAY_MS);

    expect(showWindow).toHaveBeenCalledWith(win);
  });

  it("shows nothing while the OS session ends", async () => {
    sessionEnd.isEnding = true;
    const { win, send } = fakeWindow(false);
    stopShowing = showGethStopWait(win);

    void stopProcess(fakeGeth().proc, createGethReadiness());
    await vi.advanceTimersByTimeAsync(STOP_WAIT_NOTICE_DELAY_MS);

    expect(stopWaitEvents(send)).toEqual([]);
    expect(showWindow).not.toHaveBeenCalled();
    expect(setTrayStopWaiting).not.toHaveBeenCalled();
  });
});
