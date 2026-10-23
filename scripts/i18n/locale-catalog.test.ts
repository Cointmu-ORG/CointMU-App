import { describe, expect, it } from "vitest";
import { findCatalogGaps, flattenKeys, type Catalog } from "./locale-catalog";

function catalogOf(locales: Record<string, Record<string, string[]>>): Catalog {
  return new Map(
    Object.entries(locales).map(([locale, namespaces]) => [
      locale,
      new Map(
        Object.entries(namespaces).map(([ns, keys]) => [ns, new Set(keys)]),
      ),
    ]),
  );
}

describe("flattenKeys", () => {
  it("flattens nested objects and strips plural suffixes", () => {
    const keys = flattenKeys({
      a: { b: "x", item_one: "1", item_other: "n" },
      c: "y",
    });

    expect(keys).toEqual(["a.b", "a.item", "a.item", "c"]);
  });
});

describe("findCatalogGaps", () => {
  it("compares every locale with the union, not only en", () => {
    const catalog = catalogOf({
      en: { settings: ["a"] },
      de: { settings: ["a", "b"] },
    });

    expect(findCatalogGaps(catalog, ["settings"])).toEqual([
      { locale: "en", namespace: "settings", key: "b" },
    ]);
  });

  it("reports a namespace file missing from one locale", () => {
    const catalog = catalogOf({
      en: { common: ["x"] },
      de: { common: ["x"], extension: ["y"] },
    });

    expect(findCatalogGaps(catalog, ["common"])).toEqual([
      { locale: "en", namespace: "extension", key: null },
    ]);
  });

  it("reports a registered namespace that no locale ships", () => {
    const catalog = catalogOf({ en: { common: ["x"] } });

    expect(findCatalogGaps(catalog, ["common", "auth"])).toEqual([
      { locale: "en", namespace: "auth", key: null },
    ]);
  });

  it("accepts different plural forms per locale", () => {
    const catalog = catalogOf({
      en: { common: flattenKeys({ n_one: "", n_other: "" }) },
      ja: { common: flattenKeys({ n_other: "" }) },
    });

    expect(findCatalogGaps(catalog, ["common"])).toEqual([]);
  });
});
