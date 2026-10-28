import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/shared/model";
import { INACTIVITY_TIMEOUT_MS, useAutoLock } from "./auto-lock.hook";

// Runs the hook's effect once, the way React would on mount, and keeps its
// cleanup; no DOM renderer is needed.
const effect = vi.hoisted(() => ({ cleanup: undefined as unknown }));
vi.mock("react", () => ({
  useEffect: (fn: () => unknown) => {
    effect.cleanup = fn();
  },
}));

// A stand-in with the security store's shape (settings.autoLock + subscribe),
// so this test does not reach into the settings slice.
const security = await vi.hoisted(async () => {
  const { create } = await import("zustand");
  return create(() => ({ settings: { autoLock: true } }));
});
vi.mock("@/features/settings", () => ({ useSecurityStore: security }));

const ONE_MS = 1;

function setAutoLock(autoLock: boolean): void {
  security.setState({ settings: { autoLock } });
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

  it("pauses while mining and restarts when mining stops", () => {
    const onLock = vi.fn();
    useMountedAutoLock(onLock);

    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - ONE_MS);
    useAppStore.setState({ isMining: true });
    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS * 2);
    expect(onLock).not.toHaveBeenCalled();

    useAppStore.setState({ isMining: false });
    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS);
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
