import { app } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { stat, writeFile, rm, mkdir } from "fs/promises";
import { spawn } from "child_process";
import { buildGenesis } from "./networkConfig";
import { prepareGethLaunch, type GethLaunch } from "./gethBinaryCopy";

/**
 * Resolves the absolute path to the bundled Core-geth binary based on the
 * current operating system. Uses platform-specific subdirectories to avoid
 * bundling binaries for the wrong OS.
 * @returns {string} The absolute filesystem path to the geth executable.
 */
export function resolveGethBinaryPath(): string {
  const platformDir =
    process.platform === "win32"
      ? "win"
      : process.platform === "darwin"
        ? "mac"
        : "linux";
  const binaryName = process.platform === "win32" ? "geth.exe" : "geth";
  if (app.isPackaged) {
    return join(process.resourcesPath, "bin", platformDir, binaryName);
  }
  return join(app.getAppPath(), "resources", "bin", platformDir, binaryName);
}

/**
 * Resolves the geth to spawn and its environment: on an AppImage a verified
 * copy outside the mount, else the bundled binary (see prepareGethLaunch).
 * Call it before every spawn; it re-checks the copy each time.
 * @returns {Promise<GethLaunch>} The executable and environment for spawn().
 */
export function resolveGethLaunch(): Promise<GethLaunch> {
  return prepareGethLaunch({
    bundledPath: resolveGethBinaryPath(),
    userDataDir: app.getPath("userData"),
    resourcesPath: process.resourcesPath,
    env: process.env,
    platform: process.platform,
  });
}

/**
 * Initializes the geth chain database from the inlined genesis block on a fresh
 * installation only. It detects an existing database by stat-ing the chaindata
 * directory and skips when present. On a fresh datadir it writes the effective
 * genesis to a temporary file, runs 'geth --datadir <dir> init <temp>', and
 * removes the temporary file afterward. The whole flow is invisible to the user.
 * @param {string} datadir - The absolute geth data directory.
 * @returns {Promise<void>} Resolves once the chain is initialized or already present.
 */
export async function initGethIfNeeded(datadir: string): Promise<void> {
  const chainDataPath = join(datadir, "geth", "chaindata");
  try {
    await stat(chainDataPath);
    console.log(
      "[geth:init] Chain data already exists, skipping genesis initialization.",
    );
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  const { binaryPath, env } = await resolveGethLaunch();
  if (!existsSync(binaryPath)) {
    console.warn(
      `[geth:init] Warning: Geth binary not found at ${binaryPath}. Skipping node init.`,
    );
    return;
  }

  console.log("[geth:init] Initializing chain with genesis block...");
  await mkdir(datadir, { recursive: true });
  const tempGenesisPath = join(datadir, "genesis-temp.json");
  await writeFile(
    tempGenesisPath,
    JSON.stringify(buildGenesis(), null, 2),
    "utf8",
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const initProcess = spawn(
        binaryPath,
        ["--datadir", datadir, "init", tempGenesisPath],
        {
          stdio: "ignore",
          env,
        },
      );
      initProcess.on("exit", (code) => {
        if (code === 0) {
          console.log("[geth:init] Genesis initialization successful.");
          resolve();
        } else {
          reject(new Error(`Geth init failed with code ${code}`));
        }
      });
      initProcess.on("error", reject);
    });
  } finally {
    await rm(tempGenesisPath, { force: true });
  }
}
