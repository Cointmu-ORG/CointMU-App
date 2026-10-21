import { join } from "path";
import { readdir, stat } from "fs/promises";

/**
 * Recursively sums the byte size of every file under a directory. Returns 0 when
 * the directory is missing or unreadable so callers can render a safe default.
 * @param {string} dir - The directory to measure.
 * @returns {Promise<number>} The total size in bytes.
 */
export async function getDirectorySize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySize(entryPath);
      } else if (entry.isFile()) {
        try {
          total += (await stat(entryPath)).size;
        } catch {
          total += 0;
        }
      }
    }
  } catch {
    return 0;
  }
  return total;
}
