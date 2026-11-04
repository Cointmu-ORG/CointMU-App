import { join } from "path";

const ASAR_ARCHIVE = /app\.asar$/;

/**
 * Locates the bundled extension.zip. Packaged builds unpack resources/
 * (asarUnpack in electron-builder.yml) next to the archive, in
 * app.asar.unpacked, on Windows, Linux and macOS alike; in development the
 * app path is the repository.
 * @param appPath - app.getAppPath().
 * @returns The ZIP's path on disk.
 */
export function extensionZipPath(appPath: string): string {
  return join(
    appPath.replace(ASAR_ARCHIVE, "app.asar.unpacked"),
    "resources",
    "extension.zip",
  );
}
