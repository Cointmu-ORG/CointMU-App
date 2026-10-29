import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import ms from "ms";

const SUPERVISOR = "geth-supervisor.exe";
const INTERRUPT_TIMEOUT_MS = ms("5s");

const execFileAsync = promisify(execFile);

/**
 * @param gethBinary - The geth.exe being run.
 * @returns Where geth-supervisor.exe ships: next to geth.exe.
 */
export function supervisorFor(gethBinary: string): string {
  return join(dirname(gethBinary), SUPERVISOR);
}

/** What to spawn for geth, and whether geth-supervisor.exe runs it. */
export interface GethLaunchCommand {
  file: string;
  args: string[];
  isSupervised: boolean;
}

export interface GethLaunchOptions {
  binaryPath: string;
  gethArgs: string[];
  platform: NodeJS.Platform;
  graceMs: number;
  hasFile?: (path: string) => boolean;
}

/**
 * On Windows geth runs under geth-supervisor.exe (native/geth-supervisor),
 * which must be spawned detached with its stdin piped (#97). libuv puts every
 * non-detached child in a job that Windows terminates with this process, so
 * geth itself would die uncleanly with it. The detached supervisor survives,
 * and when its stdin closes (geth stopped here, or this process gone) it
 * interrupts geth, kills it after graceMs, and exits with geth's code. geth
 * gets the supervisor's stdout and stderr, so its output arrives as before.
 * Elsewhere, or without the supervisor (a dev build without Go), it is geth.
 * @param options - geth's executable and arguments, the platform, the grace
 *   period and a file check (for tests).
 * @returns The command to spawn.
 */
export function gethLaunchCommand(
  options: GethLaunchOptions,
): GethLaunchCommand {
  const { binaryPath, gethArgs, platform, graceMs } = options;
  const hasFile = options.hasFile ?? existsSync;
  const supervisor = supervisorFor(binaryPath);
  if (platform !== "win32" || !hasFile(supervisor)) {
    return { file: binaryPath, args: gethArgs, isSupervised: false };
  }
  return {
    file: supervisor,
    args: ["run", "--grace-ms", String(graceMs), "--", binaryPath, ...gethArgs],
    isSupervised: true,
  };
}

/**
 * Asks a geth on Windows that runs without a supervisor (left by an older
 * version) to shut down cleanly: `geth-supervisor.exe interrupt <pid>` raises
 * CTRL_BREAK on its console, which geth handles like SIGINT.
 * @param pid - The geth process.
 * @param supervisor - The geth-supervisor.exe path.
 * @returns True once the interrupt is sent; false when it was not (supervisor
 *   missing, refused or failed) and geth has to be killed instead.
 */
export async function interruptGethOnWindows(
  pid: number,
  supervisor: string,
): Promise<boolean> {
  try {
    await execFileAsync(supervisor, ["interrupt", String(pid)], {
      timeout: INTERRUPT_TIMEOUT_MS,
      windowsHide: true,
    });
    return true;
  } catch (err) {
    console.warn(
      `[geth:stop] Could not interrupt geth ${pid}; killing it instead:`,
      err,
    );
    return false;
  }
}
