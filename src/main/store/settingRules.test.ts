import { describe, expect, it } from "vitest";
import { findInvalidSetting } from "./settingRules";
import { applySettingRules } from "./settingsMigration";

describe("findInvalidSetting", () => {
  it("accepts a valid leaf and rejects an invalid one", () => {
    expect(findInvalidSetting("general.closeAction", "tray")).toBeNull();
    expect(findInvalidSetting("general.closeAction", "minimize")).toBe(
      "general.closeAction",
    );
  });

  it("checks the ruled keys inside a section write", () => {
    expect(findInvalidSetting("general", { closeAction: "quit" })).toBeNull();
    expect(findInvalidSetting("general", { closeAction: 1 })).toBe(
      "general.closeAction",
    );
  });

  it("ignores keys a section write leaves out, and unruled keys", () => {
    expect(findInvalidSetting("general", { currency: "usd" })).toBeNull();
    expect(findInvalidSetting("network.maxPeers", "anything")).toBeNull();
  });
});

describe("applySettingRules", () => {
  it("fills a missing ruled key without touching the rest", () => {
    const before = { general: { currency: "usd" }, accounts: [] };

    const filled = applySettingRules(before);

    expect(filled?.general).toMatchObject({
      currency: "usd",
      closeAction: "quit",
    });
    expect(filled?.accounts).toEqual([]);
    expect(before.general).toEqual({ currency: "usd" });
  });

  it("resets an invalid stored value and keeps a valid one", () => {
    const reset = applySettingRules({ general: { closeAction: "explode" } });
    const valid: Record<string, unknown> = applySettingRules({}) ?? {};
    (valid.general as Record<string, unknown>).closeAction = "tray";

    expect(reset?.general).toMatchObject({ closeAction: "quit" });
    expect(applySettingRules(valid)).toBeNull();
  });

  it("is idempotent", () => {
    const once = applySettingRules({});

    expect(once).not.toBeNull();
    expect(applySettingRules(once ?? {})).toBeNull();
  });
});

describe("mining condition rules", () => {
  it.each([
    ["mining.schedule.start", "22:00", null],
    ["mining.schedule.end", "07:30", null],
    ["mining.schedule.end", "24:00", "mining.schedule.end"],
    ["mining.schedule.start", "7:00", "mining.schedule.start"],
    ["mining.idleThresholdMinutes", 2, null],
    ["mining.idleThresholdMinutes", 0, "mining.idleThresholdMinutes"],
    ["mining.idleThresholdMinutes", 2.5, "mining.idleThresholdMinutes"],
  ])("%s = %j → %j", (key, value, invalid) => {
    expect(findInvalidSetting(key, value)).toBe(invalid);
  });

  it("checks the schedule inside a mining section write", () => {
    expect(findInvalidSetting("mining", { schedule: { start: "25:00" } })).toBe(
      "mining.schedule.start",
    );
  });
});
