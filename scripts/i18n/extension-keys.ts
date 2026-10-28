import { flattenKeys } from "./locale-catalog";

/** Every extension key is written out in full: `data-i18n="…"` or a "…" literal. */
const EXTENSION_KEY_LITERAL = /["'](extension\.[A-Za-z0-9_.]+)["']/g;

export interface ExtensionKeyGaps {
  /** Referenced in source but not defined in en.json. */
  readonly missing: string[];
  /** Defined in en.json but referenced nowhere. */
  readonly unused: string[];
}

/**
 * Compares the extension's en.json with the keys its HTML and JS reference.
 * @param sources - Contents of every popup/shared/background source file.
 * @param locale - The parsed extension/locales/en.json.
 * @returns Keys missing from en.json and keys en.json defines but nothing uses.
 */
export function findExtensionKeyGaps(
  sources: readonly string[],
  locale: unknown,
): ExtensionKeyGaps {
  const defined = new Set(flattenKeys(locale));
  const referenced = new Set(
    sources.flatMap((source) =>
      [...source.matchAll(EXTENSION_KEY_LITERAL)].map((match) => match[1]),
    ),
  );
  return {
    missing: [...referenced].filter((key) => !defined.has(key)).sort(),
    unused: [...defined].filter((key) => !referenced.has(key)).sort(),
  };
}

export interface ExtensionLocaleGaps {
  /** In en.json but not in the translated file. */
  readonly missing: string[];
  /** In the translated file but not in en.json. */
  readonly extra: string[];
  /** Keys whose `{{placeholder}}` names differ from en.json. */
  readonly placeholderMismatch: string[];
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * @param value - A parsed locale file.
 * @param prefix - Key prefix of the current level.
 * @returns Every leaf string by its dotted key.
 */
function flattenStrings(value: unknown, prefix = ""): Map<string, string> {
  if (typeof value === "string") return new Map([[prefix, value]]);
  if (typeof value !== "object" || value === null) return new Map();
  return new Map(
    Object.entries(value).flatMap(([key, child]) => [
      ...flattenStrings(child, prefix ? `${prefix}.${key}` : key),
    ]),
  );
}

/**
 * @param text - A translated message.
 * @returns Its placeholder names, sorted, as one comparable string.
 */
function placeholderNames(text: string): string {
  return [...text.matchAll(PLACEHOLDER)]
    .map((match) => match[1])
    .sort()
    .join(",");
}

/**
 * Compares a translated extension locale with en.json: same keys, and the
 * same placeholders in each message so `formatMessage` can fill them.
 * @param english - The parsed extension/locales/en.json.
 * @param translated - Another parsed extension/locales/<lang>.json.
 * @returns What the translated file lacks, adds, or names differently.
 */
export function findExtensionLocaleGaps(
  english: unknown,
  translated: unknown,
): ExtensionLocaleGaps {
  const base = flattenStrings(english);
  const other = flattenStrings(translated);
  return {
    missing: [...base.keys()].filter((key) => !other.has(key)).sort(),
    extra: [...other.keys()].filter((key) => !base.has(key)).sort(),
    placeholderMismatch: [...base]
      .filter(
        ([key, text]) =>
          other.has(key) &&
          placeholderNames(text) !== placeholderNames(other.get(key) ?? ""),
      )
      .map(([key]) => key)
      .sort(),
  };
}
