import { describe, expect, it } from "vitest";
import {
  collectKeyRefs,
  isResolvable,
  readRegisteredNamespaces,
} from "./key-usage";

const INDEX = new Map([
  ["common", new Set(["sidebar.wallet"])],
  ["settings", new Set(["about.saveBtn", "general.title", "privacy.title"])],
  ["mining", new Set(["peerHint.NO_PEERS"])],
]);

function unresolved(source: string): string[] {
  return collectKeyRefs("a.tsx", source)
    .filter((ref) => !isResolvable(ref, INDEX))
    .map((ref) => `${ref.line}:${ref.raw}`);
}

describe("collectKeyRefs + isResolvable", () => {
  it("resolves namespaced keys and the file's default namespace", () => {
    const source = `
      const { t } = useTranslation("settings");
      t("settings:about.saveBtn"); t("general.title"); t("sidebar.wallet");`;

    expect(unresolved(source)).toEqual([]);
  });

  it("reports a key missing from every locale even when t() has a defaultValue", () => {
    const source = `const { t } = useTranslation();\nt("settings:about.save", "Save");`;

    expect(unresolved(source)).toEqual(["2:settings:about.save"]);
  });

  it("treats a dot before the namespace as part of the key", () => {
    const source = `const { t } = useTranslation(); t("ui.pairing.approve");`;

    expect(unresolved(source)).toEqual(["1:ui.pairing.approve"]);
  });

  it("matches templates per key segment, inside and outside t()", () => {
    const source = `
      t(\`settings:\${id}.title\`);
      const hint = \`mining:peerHint.\${code}\`;
      t(\`settings:\${id}.subtitle\`);`;

    expect(unresolved(source)).toEqual(["4:settings:${…}.subtitle"]);
  });

  it("checks every literal branch of a ternary or nullish fallback", () => {
    const source = `t(ok ? "settings:general.title" : "settings:gone"); t(key ?? "common:sidebar.wallet");`;

    expect(unresolved(source)).toEqual(["1:settings:gone"]);
  });

  it("reads <Trans i18nKey> and skips non-literal arguments", () => {
    const source = `const x = <Trans i18nKey="settings:missing" />; t(dynamicKey);`;

    expect(unresolved(source)).toEqual(["1:settings:missing"]);
  });

  it("checks namespaced keys kept in a map outside t()", () => {
    const source = `
      const KEYS = { ok: "settings:general.title", gone: "settings:privacy.gone" } as const;
      const store = "mining.isMiningEnabled"; const url = "http://x.y";`;

    expect(unresolved(source)).toEqual(["2:settings:privacy.gone"]);
  });

  it("reports a key once when a multi-line t() argument holds it", () => {
    const source = `t(\n  ok\n    ? "settings:general.title"\n    : "settings:gone.title",\n);`;

    expect(unresolved(source)).toEqual(["1:settings:gone.title"]);
  });
});

describe("readRegisteredNamespaces", () => {
  it("returns the declared namespace list", () => {
    expect(
      readRegisteredNamespaces(`const namespaces = ["common", "ui"];`),
    ).toEqual(["common", "ui"]);
  });

  it("fails when the list is not made of string literals", () => {
    expect(() => readRegisteredNamespaces(`const namespaces = [NS];`)).toThrow(
      /string literals/,
    );
  });
});
