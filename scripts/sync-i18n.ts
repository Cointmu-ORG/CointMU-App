import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  collectKeyRefs,
  isResolvable,
  readRegisteredNamespaces,
} from "./i18n/key-usage";
import { findExtensionKeyGaps } from "./i18n/extension-keys";
import {
  buildKeyIndex,
  findCatalogGaps,
  findPluralGaps,
  loadCatalog,
} from "./i18n/locale-catalog";

const RENDERER_DIR = path.join(__dirname, "../src/renderer/src");
const LOCALES_DIR = path.join(RENDERER_DIR, "locales");
const I18N_CONFIG = path.join(RENDERER_DIR, "app/i18n.ts");
const SOURCE_FILE = /\.tsx?$/;
const EXCLUDED_FILE = /\.(test|spec)\.tsx?$|\.d\.ts$/;
const EXTENSION_DIR = path.join(__dirname, "../extension");
const EXTENSION_SOURCE_DIRS = ["popup", "shared", "background", "content"];
const EXTENSION_SOURCE_FILE = /\.(js|html)$/;
const EXTENSION_EXCLUDED_FILE = /\.test\.js$/;

/**
 * Lists renderer source files that can reference translation keys.
 * @returns Paths relative to the repository root.
 */
function rendererSourceFiles(): string[] {
  return readdirSync(RENDERER_DIR, { recursive: true, encoding: "utf8" })
    .filter((file) => SOURCE_FILE.test(file) && !EXCLUDED_FILE.test(file))
    .map((file) => path.join(RENDERER_DIR, file));
}

/**
 * Reports locale files or keys missing from any locale, compared with the
 * union of every locale and the namespaces registered in app/i18n.ts.
 * @returns The number of gaps found.
 */
function auditCatalog(): number {
  const catalog = loadCatalog(LOCALES_DIR);
  const registered = readRegisteredNamespaces(
    readFileSync(I18N_CONFIG, "utf8"),
  );
  const gaps = findCatalogGaps(catalog, registered);
  for (const gap of gaps) {
    const what =
      gap.key === null ? "namespace file is missing" : `missing key ${gap.key}`;
    console.log(`  [${gap.locale}/${gap.namespace}.json] ${what}`);
  }
  console.log(
    `Locale coverage: ${gaps.length} gap(s) across ${catalog.size} locales.`,
  );
  return gaps.length;
}

/**
 * Reports plural keys missing a form their locale's plural rules require.
 * @returns The number of incomplete plural keys.
 */
function auditPluralForms(): number {
  let gaps = 0;
  for (const locale of readdirSync(LOCALES_DIR)) {
    const localeDir = path.join(LOCALES_DIR, locale);
    for (const file of readdirSync(localeDir).filter((f) =>
      f.endsWith(".json"),
    )) {
      const value: unknown = JSON.parse(
        readFileSync(path.join(localeDir, file), "utf8"),
      );
      for (const gap of findPluralGaps(
        locale,
        path.basename(file, ".json"),
        value,
      )) {
        gaps++;
        console.log(
          `  [${gap.locale}/${gap.namespace}.json] ${gap.key} lacks _${gap.missing.join(", _")}`,
        );
      }
    }
  }
  console.log(`Plural forms: ${gaps} incomplete plural key(s).`);
  return gaps;
}

/**
 * Reports t()/<Trans> keys in renderer source that no locale defines.
 * @returns The number of unresolved references.
 */
function auditKeyUsage(): number {
  const index = buildKeyIndex(loadCatalog(LOCALES_DIR));
  const root = path.join(__dirname, "..");
  let checked = 0;
  let unresolved = 0;
  for (const file of rendererSourceFiles()) {
    const refs = collectKeyRefs(
      path.relative(root, file),
      readFileSync(file, "utf8"),
    );
    checked += refs.length;
    for (const ref of refs.filter((r) => !isResolvable(r, index))) {
      unresolved++;
      console.log(
        `  ${ref.file}:${ref.line}  ${ref.raw}  (looked in: ${ref.namespaces.join(", ")})`,
      );
    }
  }
  console.log(
    `Key usage: ${unresolved} unresolved of ${checked} statically known key reference(s).`,
  );
  return unresolved;
}

/**
 * Reports extension keys that its HTML/JS reference but en.json lacks, and
 * en.json keys nothing references. The extension ships English only.
 * @returns The number of missing plus unused keys.
 */
function auditExtensionKeys(): number {
  const sources = EXTENSION_SOURCE_DIRS.flatMap((dir) =>
    readdirSync(path.join(EXTENSION_DIR, dir))
      .filter(
        (file) =>
          EXTENSION_SOURCE_FILE.test(file) &&
          !EXTENSION_EXCLUDED_FILE.test(file),
      )
      .map((file) => readFileSync(path.join(EXTENSION_DIR, dir, file), "utf8")),
  );
  const locale: unknown = JSON.parse(
    readFileSync(path.join(EXTENSION_DIR, "locales/en.json"), "utf8"),
  );
  const { missing, unused } = findExtensionKeyGaps(sources, locale);
  for (const key of missing)
    console.log(`  [extension/en.json] missing ${key}`);
  for (const key of unused) console.log(`  [extension/en.json] unused ${key}`);
  console.log(
    `Extension keys: ${missing.length} missing, ${unused.length} unused.`,
  );
  return missing.length + unused.length;
}

const failures =
  auditCatalog() + auditPluralForms() + auditKeyUsage() + auditExtensionKeys();
process.exit(failures > 0 ? 1 : 0);
