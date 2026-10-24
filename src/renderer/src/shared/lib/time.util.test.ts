import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatAge, formatDateTime } from "./time.util";

const NOW_SECONDS = 1_800_000_000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;

describe("formatAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_SECONDS * 1000);
  });
  afterEach(() => vi.useRealTimers());

  it("uses the largest whole unit reached", () => {
    expect(formatAge(NOW_SECONDS - 5, "en")).toBe("5 seconds ago");
    expect(formatAge(NOW_SECONDS - 3 * MINUTE_SECONDS - 59, "en")).toBe(
      "3 minutes ago",
    );
    expect(formatAge(NOW_SECONDS - 2 * HOUR_SECONDS, "en")).toBe("2 hours ago");
  });

  it("follows each language's plural rules", () => {
    expect(formatAge(NOW_SECONDS - 1, "en")).toBe("1 second ago");
    expect(formatAge(NOW_SECONDS - 2 * MINUTE_SECONDS, "ru")).toBe(
      "2 минуты назад",
    );
    expect(formatAge(NOW_SECONDS - 5 * MINUTE_SECONDS, "ru")).toBe(
      "5 минут назад",
    );
  });

  it("clamps a timestamp from the future to zero seconds", () => {
    expect(formatAge(NOW_SECONDS + 30, "en")).toBe("0 seconds ago");
  });

  it("returns the placeholder for a missing timestamp", () => {
    expect(formatAge(0, "en")).toBe("--");
    expect(formatAge(Number.NaN, "en")).toBe("--");
  });
});

describe("formatDateTime", () => {
  it("formats the date and time in the given language", () => {
    const timestampMs = Date.UTC(2026, 9, 24, 12, 0);

    expect(formatDateTime(timestampMs, "en")).toContain("2026");
    expect(formatDateTime(timestampMs, "en")).not.toBe(
      formatDateTime(timestampMs, "ja"),
    );
  });
});
