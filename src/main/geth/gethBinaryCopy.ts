import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  chmod,
  constants,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  sep,
} from "node:path";

// sha256 of the Linux geth committed at resources/bin/linux/geth; the copy run
// outside an AppImage must match it. After replacing that binary, set it to
// the output of: sha256sum resources/bin/linux/geth
// gethBinaryCopy.test.ts fails until it matches the committed file.
export const LINUX_GETH_SHA256 =
  "a546c93c1c52c2c3cf23956f4d622f87b2fbedbc8dd4d1c6134bafa478ed626b";
const COPY_ROOT_NAME = "geth-bin";
const COPY_DIR_HASH_CHARS = 16;
// Must stay "geth": orphanedGeth.ts recognises a leftover geth by that name.
const COPY_FILE_NAME = "geth";
const DIR_MODE = 0o700;
const TMP_FILE_MODE = 0o600;
const EXEC_MODE = 0o500;
const TMP_SUFFIX_BYTES = 4;
// AppRun (electron-builder) prepends the mount to these.
const MOUNT_SEARCH_PATH_VARS = ["PATH", "LD_LIBRARY_PATH"] as const;

/** The geth executable to spawn and the environment to give it. */
export interface GethLaunch {
  binaryPath: string;
  env: NodeJS.ProcessEnv;
}

export interface GethLaunchOptions {
  /** The geth shipped with the app (inside the mount on an AppImage). */
  bundledPath: string;
  userDataDir: string;
  resourcesPath: string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  expectedSha256?: string;
}

const copiesInProgress = new Map<string, Promise<string>>();

function isInside(dir: string, target: string): boolean {
  const rel = relative(dir, target);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

/**
 * An AppImage sets APPIMAGE and APPDIR for its own process, and both leak into
 * anything it launches (e.g. the .deb build started from it), so the app only
 * counts as running from the mount when its resources lie inside APPDIR.
 * @returns The mount folder (APPDIR), or null when not running from one.
 */
export function appImageMountDir(
  env: NodeJS.ProcessEnv,
  resourcesPath: string,
  platform: NodeJS.Platform,
): string | null {
  const { APPIMAGE, APPDIR } = env;
  if (platform !== "linux" || !APPIMAGE || !APPDIR) return null;
  return isInside(APPDIR, resourcesPath) ? APPDIR : null;
}

/**
 * @returns A copy of `env` whose PATH and LD_LIBRARY_PATH no longer name any
 *   folder inside the mount; a variable left empty is removed.
 */
export function envWithoutMount(
  env: NodeJS.ProcessEnv,
  mountDir: string,
): NodeJS.ProcessEnv {
  const result = { ...env };
  for (const name of MOUNT_SEARCH_PATH_VARS) {
    const value = env[name];
    if (value === undefined) continue;
    const kept = value
      .split(delimiter)
      .filter((entry) => !isAbsolute(entry) || !isInside(mountDir, entry))
      .join(delimiter);
    if (kept) result[name] = kept;
    else delete result[name];
  }
  return result;
}

async function sha256OfFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** @returns True when `target` holds the expected geth; drops a changed one. */
async function isIntactCopy(
  target: string,
  expectedSha256: string,
): Promise<boolean> {
  let actual: string;
  try {
    actual = await sha256OfFile(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
  if (actual === expectedSha256) return true;
  console.warn(
    `[geth:copy] ${target} has changed (sha256 ${actual}); copying it again`,
  );
  await rm(target, { force: true });
  return false;
}

/**
 * Writes the copy under a fresh name, checks it, then renames it into place,
 * so `target` only ever holds a complete, verified file.
 */
async function writeCopy(
  source: string,
  target: string,
  expectedSha256: string,
): Promise<void> {
  const dir = dirname(target);
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  await chmod(dirname(dir), DIR_MODE);
  await chmod(dir, DIR_MODE);
  const suffix = randomBytes(TMP_SUFFIX_BYTES).toString("hex");
  const tmp = join(dir, `${COPY_FILE_NAME}.${process.pid}.${suffix}.tmp`);
  try {
    const handle = await open(tmp, "wx", TMP_FILE_MODE);
    try {
      await writeFile(handle, createReadStream(source));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(tmp, EXEC_MODE);
    const actual = await sha256OfFile(tmp);
    if (actual !== expectedSha256) {
      throw new Error(
        `copy of ${source} has sha256 ${actual}, expected ${expectedSha256}`,
      );
    }
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** Best effort: removes every entry of `dir` except `keepName`. */
async function removeOtherEntries(
  dir: string,
  keepName: string,
): Promise<void> {
  try {
    const stale = (await readdir(dir)).filter((name) => name !== keepName);
    await Promise.all(
      stale.map((name) =>
        rm(join(dir, name), { recursive: true, force: true }),
      ),
    );
  } catch (err) {
    console.warn(
      `[geth:copy] Could not remove old geth copies in ${dir}:`,
      err,
    );
  }
}

async function ensureCopy(
  source: string,
  target: string,
  expectedSha256: string,
): Promise<string> {
  if (!(await isIntactCopy(target, expectedSha256))) {
    await writeCopy(source, target, expectedSha256);
  }
  // Also fails with EACCES when the folder is on a noexec mount.
  await access(target, constants.X_OK);
  const dir = dirname(target);
  await removeOtherEntries(dir, COPY_FILE_NAME);
  await removeOtherEntries(dirname(dir), basename(dir));
  return target;
}

/**
 * Verifies, and creates or repairs if needed, the copy of geth outside the
 * mount. Concurrent calls for the same copy share one run.
 * @returns The copy's path.
 * @throws When the copy cannot be written, does not match, or cannot run.
 */
function ensureGethCopy(
  source: string,
  rootDir: string,
  expectedSha256: string,
): Promise<string> {
  const target = join(
    rootDir,
    expectedSha256.slice(0, COPY_DIR_HASH_CHARS),
    COPY_FILE_NAME,
  );
  let run = copiesInProgress.get(target);
  if (!run) {
    run = ensureCopy(source, target, expectedSha256).finally(() => {
      copiesInProgress.delete(target);
    });
    copiesInProgress.set(target, run);
  }
  return run;
}

/**
 * Picks the geth to spawn. On an AppImage, geth runs from a copy in
 * userData/geth-bin/<sha256[:16]>/geth, hashed before every spawn, so it does
 * not depend on the FUSE mount staying up while it shuts down (#90); its PATH
 * and LD_LIBRARY_PATH lose the mount's folders. Anywhere else, or when the copy
 * fails, it is the bundled geth with the app's environment.
 * @returns Never rejects.
 */
export async function prepareGethLaunch(
  options: GethLaunchOptions,
): Promise<GethLaunch> {
  const bundled = { binaryPath: options.bundledPath, env: options.env };
  const mountDir = appImageMountDir(
    options.env,
    options.resourcesPath,
    options.platform,
  );
  if (!mountDir) return bundled;
  const startedAt = Date.now();
  try {
    const binaryPath = await ensureGethCopy(
      options.bundledPath,
      join(options.userDataDir, COPY_ROOT_NAME),
      options.expectedSha256 ?? LINUX_GETH_SHA256,
    );
    console.log(
      `[geth:copy] Running ${binaryPath} (verified in ${Date.now() - startedAt} ms)`,
    );
    return { binaryPath, env: envWithoutMount(options.env, mountDir) };
  } catch (err) {
    console.warn(
      "[geth:copy] Cannot run geth from a copy outside the AppImage; running it from the mount:",
      err,
    );
    return bundled;
  }
}
