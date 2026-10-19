import * as fs from "fs";
import * as path from "path";

const LOCALES_DIR = path.join(__dirname, "../src/renderer/src/locales");
const SOURCE_LANG = "en";

/**
 * Recursively diffs an object against a source object to find missing keys.
 * @param source - The source object to check against.
 * @param target - The target object to check for missing keys.
 * @param prefix - The current object path prefix.
 * @returns An array of missing key paths.
 */
function findMissingKeys(source: any, target: any, prefix = ""): string[] {
  let missing: string[] = [];

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;

      if (target[key] === undefined) {
        missing.push(currentPath);
      } else if (typeof source[key] === "object" && source[key] !== null) {
        if (typeof target[key] === "object" && target[key] !== null) {
          missing = missing.concat(
            findMissingKeys(source[key], target[key], currentPath),
          );
        } else {
          missing.push(currentPath);
        }
      }
    }
  }

  return missing;
}

/**
 * Audits all target locale namespaces against the primary english locale namespaces.
 * @returns Void.
 */
function auditLocales(): void {
  const sourceDir = path.join(LOCALES_DIR, SOURCE_LANG);

  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  const namespaces = fs
    .readdirSync(sourceDir)
    .filter((file) => file.endsWith(".json"));

  const allLangs = fs
    .readdirSync(LOCALES_DIR)
    .filter((dir) => fs.statSync(path.join(LOCALES_DIR, dir)).isDirectory());

  const targetLangs = allLangs.filter((lang) => lang !== SOURCE_LANG);

  console.log(`Starting i18n audit against ${SOURCE_LANG} namespaces...`);

  let totalMissing = 0;

  targetLangs.forEach((targetLang) => {
    const targetDir = path.join(LOCALES_DIR, targetLang);

    namespaces.forEach((namespaceFile) => {
      const sourcePath = path.join(sourceDir, namespaceFile);
      const targetPath = path.join(targetDir, namespaceFile);

      const sourceData = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

      let targetData = {};
      if (fs.existsSync(targetPath)) {
        targetData = JSON.parse(fs.readFileSync(targetPath, "utf8"));
      } else {
        console.warn(
          `\n[${targetLang}/${namespaceFile}] File is completely missing.`,
        );
      }

      const missingKeys = findMissingKeys(sourceData, targetData);

      if (missingKeys.length > 0) {
        console.log(
          `\n[${targetLang}/${namespaceFile}] Missing ${missingKeys.length} keys:`,
        );
        missingKeys.forEach((key) => console.log(`  - ${key}`));
        totalMissing += missingKeys.length;
      }
    });
  });

  if (totalMissing > 0) {
    console.log(
      `\nAudit complete. Found ${totalMissing} missing translations total.`,
    );
    process.exit(1);
  } else {
    console.log("\nAudit complete. 100% translation coverage!");
    process.exit(0);
  }
}

auditLocales();
