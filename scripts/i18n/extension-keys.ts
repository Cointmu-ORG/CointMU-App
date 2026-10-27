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
