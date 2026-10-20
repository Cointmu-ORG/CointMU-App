import { describe, expect, it } from "vitest";
import { updateMakefileVersion } from "./sync-release-files.js";

const MAKEFILE = [
  "VERSION = 1",
  "PATCHLEVEL = 6",
  "SUBLEVEL = 16",
  "EXTRAVERSION = Kitsune",
  "",
  "dev:",
  "\tnpm run dev",
  "",
].join("\n");

describe("updateMakefileVersion", () => {
  it("rewrites every version field and leaves the rest alone", () => {
    const updated = updateMakefileVersion(MAKEFILE, "1.7.0", "Siren");

    expect(updated).toBe(
      MAKEFILE.replace("PATCHLEVEL = 6", "PATCHLEVEL = 7")
        .replace("SUBLEVEL = 16", "SUBLEVEL = 0")
        .replace("Kitsune", "Siren"),
    );
  });

  it("drops a prerelease suffix", () => {
    const updated = updateMakefileVersion(MAKEFILE, "1.6.17-beta.0", "Siren");

    expect(updated).toContain("SUBLEVEL = 17\n");
  });

  it("fails when a field is missing", () => {
    const withoutSublevel = MAKEFILE.replace("SUBLEVEL = 16\n", "");

    expect(() =>
      updateMakefileVersion(withoutSublevel, "1.6.17", "Siren"),
    ).toThrow("Makefile has no SUBLEVEL line");
  });
});
