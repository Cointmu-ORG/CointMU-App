import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/shared/model";
import {
  getSessionPassword,
  lockSession,
  unlockSession,
} from "@/entities/wallet";
import { useAutoLock } from "./auto-lock.hook";

// Runs the hook's effect once, the way React would on mount, and keeps its
// cleanup; no DOM renderer is needed.
const effect = vi.hoisted(() => ({ cleanup: undefined as unknown }));
vi.mock("react", () => ({
  useEffect: (fn: () => unknown) => {
    effect.cleanup = fn();
  },
}));

// A stand-in with the security store's shape (settings.autoLockMinutes +
// subscribe), so this test does not reach into the settings slice.
const security = await vi.hoisted(async () => {
  const { create } = await import("zustand");
  return create(() => ({ settings: { autoLockMinutes: 5 } }));
});
vi.mock("@/features/settings", () => ({ useSecurityStore: security }));

const ONE_MS = 1;
const MINUTES = 5;
const INACTIVITY_TIMEOUT_MS = MINUTES * 60_000;

/** On = MINUTES idle minutes, off = Never (0). */
function setAutoLock(isOn: boolean): void {
  security.setState({ settings: { autoLockMinutes: isOn ? MINUTES : 0 } });
}

function useMountedAutoLock(onLock: () => void, isActive = true): () => void {
  useAutoLock(onLock, isActive);
  return (effect.cleanup as (() => void) | undefined) ?? (() => {});
}

describe("useAutoLock", () => {
  let target: EventTarget;

  beforeEach(() => {
    vi.useFakeTimers();
    target = new EventTarget();
    vi.stubGlobal("document", target);
    effect.cleanup = undefined;
    setAutoLock(true);
    useAppStore.setState({ isMining: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("locks after the inactivity timeout", () => {
    const onLock = vi.fn();
    useMountedAutoLock(onLock);

    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - ONE_MS);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(ONE_MS);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("restarts the timer on user activity", () => {
    const onLock = vi.fn();
    useMountedAutoLock(onLock);

    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - ONE_MS);
    target.dispatchEvent(new Event("mousemove"));
    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - ONE_MS);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(ONE_MS);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it.each(["mousedown", "keypress", "scroll", "touchstart"])(
    "treats %s as activity",
    (type) => {
      const onLock = vi.fn();
      useMountedAutoLock(onLock);

      vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - ONE_MS);
      target.dispatchEvent(new Event(type));
      vi.advanceTimersByTime(ONE_MS);
      expect(onLock).not.toHaveBeenCalled();
    },
  );

  it("never locks while auto-lock is off, and starts when it is turned on", () => {
    setAutoLock(false);
    const onLock = vi.fn();
    useMountedAutoLock(onLock);

    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS * 2);
    expect(onLock).not.toHaveBeenCalled();

    setAutoLock(true);
    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("waits the chosen number of minutes", () => {
    security.setState({ settings: { autoLockMinutes: 15 } });
    const onLock = vi.fn();
    useMountedAutoLock(onLock);

    vi.advanceTimersByTime(15 * 60_000 - ONE_MS);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(ONE_MS);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("locks after the idle time while the node is mining", () => {
    useAppStore.setState({ isMining: true });
    const onLock = vi.fn();
    useMountedAutoLock(onLock);

    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - ONE_MS);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(ONE_MS);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("keeps mining running when the wallet locks", () => {
    const mining = { toggle: vi.fn(), setThreads: vi.fn() };
    vi.stubGlobal("window", { api: { mining } });
    useAppStore.setState({ isMining: true });
    unlockSession("cdp-test-pass-1");
    useMountedAutoLock(lockSession);

    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS);

    expect(getSessionPassword()).toBeNull();
    expect(mining.toggle).not.toHaveBeenCalled();
    expect(useAppStore.getState().isMining).toBe(true);
  });

  it("does not restart the idle time when mining starts or stops", () => {
    const onLock = vi.fn();
    useMountedAutoLock(onLock);

    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - ONE_MS);
    useAppStore.setState({ isMining: true });
    vi.advanceTimersByTime(ONE_MS);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("does nothing while inactive (no wallet unlocked)", () => {
    const onLock = vi.fn();
    useMountedAutoLock(onLock, false);

    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS * 2);
    expect(onLock).not.toHaveBeenCalled();
    expect(effect.cleanup).toBeUndefined();
  });

  it("stops timing and listening after cleanup", () => {
    const onLock = vi.fn();
    const cleanup = useMountedAutoLock(onLock);

    cleanup();
    target.dispatchEvent(new Event("mousemove"));
    setAutoLock(false);
    setAutoLock(true);
    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS * 2);
    expect(onLock).not.toHaveBeenCalled();
  });
});
