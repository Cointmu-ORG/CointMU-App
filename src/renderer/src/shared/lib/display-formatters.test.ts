import { beforeEach, describe, expect, it } from "vitest";
import { useDisplayPrefs, TimeFormat } from "@/shared/model";
import { formatBalance, formatWeiBalance } from "@/shared/api/rpc.client";
import { formatDateTime, formatTime } from "./time.util";

// 2026-11-05 13:05:09 UTC.
const AFTERNOON_MS = Date.UTC(2026, 10, 5, 13, 5, 9);
const WEI = 1_284_673_901_234_567_890_123n;

describe("balance decimals", () => {
  beforeEach(() => {
    useDisplayPrefs.getState().resetDisplayPrefs();
  });

  it("shows two decimals by default", () => {
    expect(formatBalance(1284.6789)).toBe("1,284.68");
    expect(formatWeiBalance(WEI)).toBe("1,284.67");
  });

  it("shows the chosen number of decimals", () => {
    useDisplayPrefs.getState().setBalanceDecimals(6);

    expect(formatBalance(1284.6789)).toBe("1,284.678900");
    expect(formatWeiBalance(WEI)).toBe("1,284.673901");
  });

  it("shows the exact wei amount with Full, at least two decimals", () => {
    useDisplayPrefs.getState().setBalanceDecimals("full");

    expect(formatWeiBalance(WEI)).toBe("1,284.673901234567890123");
    expect(formatWeiBalance(5n * 10n ** 18n)).toBe("5.00");
    expect(formatWeiBalance(0n)).toBe("0.00");
  });
});

describe("time format", () => {
  beforeEach(() => {
    useDisplayPrefs.getState().resetDisplayPrefs();
  });

  it("follows the language when automatic", () => {
    expect(formatTime(AFTERNOON_MS, "de")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(formatTime(AFTERNOON_MS, "en-US")).toMatch(/[AP]M$/);
  });

  it("forces the 12- or 24-hour clock in any language", () => {
    useDisplayPrefs.getState().setTimeFormat(TimeFormat.H24);
    expect(formatTime(AFTERNOON_MS, "en-US")).not.toMatch(/[AP]M/);
    expect(formatDateTime(AFTERNOON_MS, "en-US")).not.toMatch(/[AP]M/);

    useDisplayPrefs.getState().setTimeFormat(TimeFormat.H12);
    expect(formatTime(AFTERNOON_MS, "en-US")).toMatch(/[AP]M$/);
  });
});
