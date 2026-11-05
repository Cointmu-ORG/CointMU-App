import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sanitizeLocal } from "./localSanitizer";
import type { ZipEntry } from "./zipWriter";

const LOG_FILE_PATTERN = /\.log$/;
const JSON_INDENT = 2;

/**
 * Settings sections copied into the bundle. An allowlist: wallet data
 * (mnemonic, encrypted keys, accounts), the notification history, pairing
 * and connected sites are never read, whatever the store holds.
 */
const SETTINGS_SECTIONS = [
  "general",
  "appearance",
  "network",
  "mining",
  "security",
  "advanced",
  "notifications",
] as const;

/** What the bundle is built from; the app wires the real sources. */
export interface DiagnosticSources {
  readonly logsDir: string;
  /** The whole store content; only SETTINGS_SECTIONS are taken from it. */
  readonly settings: Readonly<Record<string, unknown>>;
  readonly versions: () => Promise<Readonly<Record<string, string>>>;
}

/**
 * @param settings - The whole store content.
 * @returns Only the allowed sections, as sanitized JSON text.
 */
export function pickDiagnosticSettings(
  settings: Readonly<Record<string, unknown>>,
): string {
  const picked = Object.fromEntries(
    SETTINGS_SECTIONS.filter((section) => section in settings).map(
      (section) => [section, settings[section]],
    ),
  );
  return sanitizeLocal(JSON.stringify(picked, null, JSON_INDENT));
}

/**
 * @param logsDir - The app's log folder.
 * @returns Every .log file (current and rotated), sanitized again: old lines
 *   may predate the write-time sanitizer.
 */
async function readLogs(logsDir: string): Promise<ZipEntry[]> {
  const names = await readdir(logsDir).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return [];
    throw err;
  });
  const logs = names.filter((name) => LOG_FILE_PATTERN.test(name)).sort();
  return Promise.all(
    logs.map(async (name) => ({
      name: `logs/${name}`,
      data: Buffer.from(
        sanitizeLocal(await readFile(join(logsDir, name), "utf8")),
      ),
    })),
  );
}

/**
 * Collects the diagnostic bundle: app and geth logs, versions, and the
 * non-secret settings, all passed through the local sanitizer.
 * @param sources - Where to read from.
 * @returns The files for the archive.
 */
export async function collectDiagnosticBundle(
  sources: DiagnosticSources,
): Promise<ZipEntry[]> {
  const versions = await sources.versions();
  return [
    {
      name: "versions.json",
      data: Buffer.from(
        sanitizeLocal(JSON.stringify(versions, null, JSON_INDENT)),
      ),
    },
    {
      name: "settings.json",
      data: Buffer.from(pickDiagnosticSettings(sources.settings)),
    },
    ...(await readLogs(sources.logsDir)),
  ];
}
