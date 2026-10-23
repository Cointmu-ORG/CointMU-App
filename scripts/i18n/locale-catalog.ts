import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";

/** Flattened translation keys, indexed as locale -> namespace -> keys. */
export type Catalog = ReadonlyMap<
  string,
  ReadonlyMap<string, ReadonlySet<string>>
>;

/** Union of keys across every locale, indexed as namespace -> keys. */
export type KeyIndex = ReadonlyMap<string, ReadonlySet<string>>;

/** A namespace file (key === null) or a single key absent from one locale. */
export interface CatalogGap {
  readonly locale: string;
  readonly namespace: string;
  readonly key: string | null;
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/**
 * Strips an i18next plural suffix so locales with different plural rules
 * (ja has only `_other`, ru adds `_few`/`_many`) compare by base key.
 * @param key - A flattened translation key.
 * @returns The key without its plural suffix.
 */
export function basePluralKey(key: string): string {
  return key.replace(PLURAL_SUFFIX, "");
}

/**
 * Flattens a nested translation object into dot-notation leaf keys.
 * @param value - Parsed namespace JSON.
 * @param prefix - Key path of the current level.
 * @returns Every leaf key, plural suffixes stripped.
 */
export function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return prefix ? [basePluralKey(prefix)] : [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * Reads every `<locale>/<namespace>.json` file under a locales directory.
 * @param localesDir - Directory holding one folder per locale.
 * @returns The catalog of flattened keys.
 * @throws When a namespace file is not valid JSON.
 */
export function loadCatalog(localesDir: string): Catalog {
  const catalog = new Map<string, Map<string, Set<string>>>();
  for (const locale of readdirSync(localesDir)) {
    const localeDir = path.join(localesDir, locale);
    if (!statSync(localeDir).isDirectory()) continue;
    const namespaces = new Map<string, Set<string>>();
    for (const file of readdirSync(localeDir).filter((f) =>
      f.endsWith(".json"),
    )) {
      const filePath = path.join(localeDir, file);
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(filePath, "utf8"));
      } catch (error) {
        throw new Error(`Invalid JSON in ${filePath}: ${String(error)}`);
      }
      namespaces.set(
        path.basename(file, ".json"),
        new Set(flattenKeys(parsed)),
      );
    }
    catalog.set(locale, namespaces);
  }
  return catalog;
}

/**
 * Merges the keys of all locales per namespace.
 * @param catalog - The loaded catalog.
 * @returns Namespace -> union of keys.
 */
export function buildKeyIndex(catalog: Catalog): KeyIndex {
  const index = new Map<string, Set<string>>();
  for (const namespaces of catalog.values()) {
    for (const [namespace, keys] of namespaces) {
      const merged = index.get(namespace) ?? new Set<string>();
      for (const key of keys) merged.add(key);
      index.set(namespace, merged);
    }
  }
  return index;
}

/**
 * Lists everything a locale lacks compared with the union of all locales,
 * plus namespaces the i18n config registers that a locale has no file for.
 * @param catalog - The loaded catalog.
 * @param requiredNamespaces - Namespaces registered in the i18n config.
 * @returns Missing namespace files first per locale, then missing keys.
 */
export function findCatalogGaps(
  catalog: Catalog,
  requiredNamespaces: readonly string[],
): CatalogGap[] {
  const index = buildKeyIndex(catalog);
  const allNamespaces = [
    ...new Set([...requiredNamespaces, ...index.keys()]),
  ].sort();
  const gaps: CatalogGap[] = [];
  for (const [locale, namespaces] of [...catalog].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    for (const namespace of allNamespaces) {
      const keys = namespaces.get(namespace);
      if (!keys) {
        gaps.push({ locale, namespace, key: null });
        continue;
      }
      for (const key of index.get(namespace) ?? []) {
        if (!keys.has(key)) gaps.push({ locale, namespace, key });
      }
    }
  }
  return gaps;
}
