import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GETH_READY_LOG,
  GETH_READY_MARGIN_MS,
  GETH_READY_WAIT_MS,
  createGethReadiness,
} from "./gethReadiness";

const READY_LINE = `INFO [11-19|21:10:33.276] ${GETH_READY_LOG}  instance=Geth/v1.10.26`;
const REPAIR_LINE = "WARN [11-19|21:10:33.100] Head state missing, repairing";

describe("createGethReadiness", () => {
  let isDone: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    isDone = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function track(promise: Promise<void>): void {
    void promise.then(() => {
      isDone = true;
    });
  }

  it("waits for the ready line plus the margin", async () => {
    const onReady = vi.fn();
    const readiness = createGethReadiness(onReady);
    track(readiness.untilInterruptible());

    readiness.observe(REPAIR_LINE);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(isDone).toBe(false);

    readiness.observe(READY_LINE);
    readiness.observe(READY_LINE);
    await vi.advanceTimersByTimeAsync(GETH_READY_MARGIN_MS - 1);
    expect(isDone).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(isDone).toBe(true);
    expect(readiness.isReady()).toBe(true);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("does not wait again once the margin has passed", async () => {
    const readiness = createGethReadiness();
    readiness.observe(READY_LINE);
    await vi.advanceTimersByTimeAsync(GETH_READY_MARGIN_MS);

    track(readiness.untilInterruptible());
    await vi.advanceTimersByTimeAsync(0);

    expect(isDone).toBe(true);
  });

  it("gives up after the cap when geth never gets ready", async () => {
    const readiness = createGethReadiness();
    track(readiness.untilInterruptible());

    await vi.advanceTimersByTimeAsync(GETH_READY_WAIT_MS - 1);
    expect(isDone).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(isDone).toBe(true);
    expect(readiness.isReady()).toBe(false);
  });

  it("ends the wait when geth exits", async () => {
    const readiness = createGethReadiness();
    track(readiness.untilInterruptible());

    readiness.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(isDone).toBe(true);
  });
});
