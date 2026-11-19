import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  assertSafeDagFile,
  isDagFileName,
} from "../geth/recovery/recoveryPathGuard";

/**
 * Where geth 1.10.26 keeps the ethash DAG when --ethash.dagdir is not set
 * (the app never sets it): ~/.ethash, ~/Library/Ethash on macOS, and
 * %LOCALAPPDATA%\Ethash on Windows.
 * @param platform - process.platform.
 * @param home - The user's home folder.
 * @param localAppData - %LOCALAPPDATA%, if set.
 * @returns The absolute DAG folder.
 */
export function resolveDagDir(
  platform: NodeJS.Platform,
  home: string,
  localAppData: string | undefined,
): string {
  if (platform === "darwin") return join(home, "Library", "Ethash");
  if (platform === "win32") {
    return join(localAppData ?? join(home, "AppData", "Local"), "Ethash");
  }
  return join(home, ".ethash");
}

/**
 * Lists the DAG files in a folder, each passed through the DAG guard.
 * @param dagDir - The absolute DAG folder.
 * @returns The file paths; none when the folder is missing.
 */
export async function listDagFiles(dagDir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dagDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return names.filter(isDagFileName).map((name) => {
    const target = join(dagDir, name);
    assertSafeDagFile(dagDir, target);
    return target;
  });
}

/** @returns The total size of the DAG files in bytes. */
export async function dagSizeBytes(dagDir: string): Promise<number> {
  const sizes = await Promise.all(
    (await listDagFiles(dagDir)).map(async (file) => (await stat(file)).size),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}

/**
 * Deletes the DAG files; geth generates them again the next time mining
 * starts. The folder and anything else in it stay.
 * @param dagDir - The absolute DAG folder.
 */
export async function deleteDagFiles(dagDir: string): Promise<void> {
  for (const file of await listDagFiles(dagDir)) {
    await rm(file, { force: true });
  }
  console.warn(`[mining] Deleted the DAG files in ${dagDir}`);
}
