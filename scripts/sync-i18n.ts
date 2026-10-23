import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  collectKeyRefs,
  isResolvable,
  readRegisteredNamespaces,
} from "./i18n/key-usage";
import {
  buildKeyIndex,
  findCatalogGaps,
  loadCatalog,
} from "./i18n/locale-catalog";

const RENDERER_DIR = path.join(__dirname, "../src/renderer/src");
const LOCALES_DIR = path.join(RENDERER_DIR, "locales");
const I18N_CONFIG = path.join(RENDERER_DIR, "app/i18n.ts");
const SOURCE_FILE = /\.tsx?$/;
const EXCLUDED_FILE = /\.(test|spec)\.tsx?$|\.d\.ts$/;

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

const failures = auditCatalog() + auditKeyUsage();
process.exit(failures > 0 ? 1 : 0);
