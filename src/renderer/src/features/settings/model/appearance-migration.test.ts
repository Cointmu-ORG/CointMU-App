import { describe, expect, it } from "vitest";
import {
  APPEARANCE_STORAGE_VERSION,
  migrateAppearance,
} from "./appearance-migration";

// localStorage "cointmu-appearance-storage" as the released 1.6.18 app wrote
// it after choosing Dark and Compact in its UI.
const STORED_1_6_18 =
  '{"state":{"theme":"Dark","accentColor":"#3b82f6","density":"Compact","showSidebarColors":true,"animatedTransitions":true},"version":0}';

describe("migrateAppearance", () => {
  it("converts the labels a 1.6.18 app stored to codes, and its motion switch", () => {
    const { state } = JSON.parse(STORED_1_6_18);

    expect(migrateAppearance(state)).toEqual({
      theme: "dark",
      accentColor: "#3b82f6",
      density: "compact",
      motion: "auto",
      sidebarIconColors: false,
    });
  });

  it("turns colored sidebar icons off for a stored showSidebarColors true", () => {
    // Version 2 as 1.7.x wrote it: true for everyone, with no control shown.
    const stored = {
      theme: "light",
      density: "comfortable",
      motion: "auto",
      showSidebarColors: true,
    };

    const migrated = migrateAppearance(stored);

    expect(migrated.sidebarIconColors).toBe(false);
    expect(migrated).not.toHaveProperty("showSidebarColors");
    expect(migrateAppearance(migrated)).toEqual(migrated);
  });

  it("runs for the version 2 stores 1.7.x wrote", () => {
    // zustand calls migrate only for a stored version below the current one.
    expect(APPEARANCE_STORAGE_VERSION).toBeGreaterThan(2);
  });

  it("keeps colored sidebar icons a user turned on", () => {
    const stored = { theme: "dark", sidebarIconColors: true };

    expect(migrateAppearance(stored).sidebarIconColors).toBe(true);
  });

  it("is idempotent", () => {
    const once = migrateAppearance(JSON.parse(STORED_1_6_18).state);

    expect(migrateAppearance(once)).toEqual(once);
  });

  it.each([
    [{ animatedTransitions: true }, "auto"],
    [{ animatedTransitions: false }, "off"],
    [{}, "auto"],
    [{ motion: "on", animatedTransitions: false }, "on"],
    [{ motion: "sideways" }, "auto"],
  ])("maps %j to motion %j", (stored, motion) => {
    const migrated = migrateAppearance(stored);

    expect(migrated.motion).toBe(motion);
    expect(migrated).not.toHaveProperty("animatedTransitions");
  });

  it.each([null, "garbage", { theme: "Neon", density: 3 }])(
    "falls back to the defaults for %j",
    (stored) => {
      expect(migrateAppearance(stored)).toMatchObject({
        theme: "auto",
        density: "comfortable",
        motion: "auto",
        sidebarIconColors: false,
      });
    },
  );
});
