import { describe, expect, it } from "vitest";
import { parseCommit, renderNotes } from "./release-notes.js";

const OWN_AUTHOR = "Maintainer <maintainer@example.com>";
const DEPENDABOT_AUTHOR =
  "dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>";

function entry(subject, { author = OWN_AUTHOR, mergedPr = null } = {}) {
  const hash = `${subject.length}`.padStart(40, "0");
  const mergedPrByHash = new Map(mergedPr ? [[hash, mergedPr]] : []);
  return parseCommit(
    { hash, shortHash: hash.slice(0, 7), author, subject },
    mergedPrByHash,
  );
}

function render(entries) {
  return renderNotes({
    version: "1.6.17",
    codename: "Kitsune",
    repository: "owner/repo",
    previousTag: "v1.6.16",
    tag: "v1.6.17",
    entries,
  });
}

describe("parseCommit", () => {
  it("reads type, scope, breaking flag and squashed PR number", () => {
    const parsed = entry("feat(wallet)!: drop legacy keystore (#12)");

    expect(parsed).toMatchObject({
      type: "feat",
      scope: "wallet",
      breaking: true,
      description: "drop legacy keystore",
      pr: "12",
    });
  });

  it("falls back to the PR of the merge commit", () => {
    expect(entry("fix: guard empty input", { mergedPr: "41" }).pr).toBe("41");
  });

  it("keeps non-conventional subjects as the description", () => {
    expect(entry("Update readme")).toMatchObject({
      type: null,
      description: "Update readme",
    });
  });
});

describe("renderNotes", () => {
  it("groups by category and folds Dependabot into one bullet", () => {
    const notes = render([
      entry("feat(mining): show sync progress", { mergedPr: "41" }),
      entry("perf: cache block lookups"),
      entry("ci: add checks", { mergedPr: "46" }),
      entry("chore(deps): bump a", {
        author: DEPENDABOT_AUTHOR,
        mergedPr: "39",
      }),
      entry("chore(deps-dev): bump b group", {
        author: DEPENDABOT_AUTHOR,
        mergedPr: "40",
      }),
    ]);

    expect(notes).toContain('## CointMU v1.6.17 "Kitsune"');
    expect(notes).toMatch(
      /### ✨ Features\n\n- \*\*mining:\*\* show sync progress \(#41\) 0+/,
    );
    expect(notes).toContain("### ⚡ Performance");
    expect(notes).toContain(
      "- Dependency updates by Dependabot: 2 updates (#39, #40)",
    );
    expect(notes).not.toContain("### 🐛 Fixes");
    expect(notes).toContain(
      "**Full changelog:** https://github.com/owner/repo/compare/v1.6.16...v1.6.17",
    );
  });

  it("shows only the header and changelog link when nothing changed", () => {
    expect(render([])).toBe(
      '## CointMU v1.6.17 "Kitsune"\n\n' +
        "**Full changelog:** https://github.com/owner/repo/compare/v1.6.16...v1.6.17",
    );
  });
});
