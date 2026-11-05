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
