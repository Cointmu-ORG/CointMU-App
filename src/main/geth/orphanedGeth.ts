import { execFile } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import ms from "ms";
import { interruptGethOnWindows } from "./gethInterrupt";

/** How long geth gets to close its database after SIGINT before SIGKILL. */
export const GETH_GRACEFUL_TIMEOUT_MS = ms("15s");
const KILL_SETTLE_TIMEOUT_MS = ms("5s");
const EXIT_POLL_INTERVAL_MS = 250;
const COMMAND_LINE_TIMEOUT_MS = ms("10s");
const PID_FILE_NAME = "geth.pid";
// A path segment named geth or geth.exe. Searched only in the text before
// --datadir, so installs under folders with spaces still match.
const GETH_EXECUTABLE_RE = /(?:^|[\\/])geth(?:\.exe)?(?:\s|$)/i;

const execFileAsync = promisify(execFile);

/**
 * @param dataRoot - The folder holding every network's geth datadir.
 * @returns Where the PID of the running geth is recorded.
 */
function pidFilePath(dataRoot: string): string {
  return join(dataRoot, PID_FILE_NAME);
}

/**
 * Records the PID of a freshly spawned geth so the next app start can find it
 * if this process dies without stopping it (SIGKILL, crash, power loss).
 * @param dataRoot - The folder holding every network's geth datadir.
 * @param pid - The spawned geth's PID.
 */
export function writeGethPidFile(dataRoot: string, pid: number): void {
  try {
    writeFileSync(pidFilePath(dataRoot), String(pid));
  } catch (err) {
    console.warn("[geth:orphan] Could not record the geth PID:", err);
  }
}

/**
 * Forgets a geth that has exited. Leaves the file alone when it already names
 * a newer geth, so a late exit event cannot erase the next spawn's record.
 * @param dataRoot - The folder holding every network's geth datadir.
 * @param pid - The PID of the geth that exited.
 */
export function removeGethPidFile(dataRoot: string, pid: number): void {
  const file = pidFilePath(dataRoot);
  try {
    if (readFileSync(file, "utf8").trim() === String(pid)) {
      rmSync(file, { force: true });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[geth:orphan] Could not clear the geth PID file:", err);
    }
  }
}

/**
 * @param text - The PID file content.
 * @returns The PID, or null when the content is not a positive integer.
 */
export function parsePidFile(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const pid = Number(trimmed);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

/**
 * Decides whether a process command line is a geth this app started: the
 * executable is named geth and its --datadir lies inside our data root. The
 * binary path is not compared because an AppImage mounts at a new path on
 * every launch.
 * @param commandLine - The command line, with NUL (Linux) or space separators.
 * @param dataRoot - The folder holding every network's geth datadir.
 * @param platform - Selects path separator and case rules.
 * @returns True only for our own geth.
 */
export function isOwnGethCommandLine(
  commandLine: string,
  dataRoot: string,
  platform: NodeJS.Platform,
): boolean {
  const isWindows = platform === "win32";
  const normalize = (text: string): string => {
    const plain = text.replace(/\0/g, " ").replace(/"/g, "").trim();
    return isWindows ? plain.toLowerCase() : plain;
  };
  const separator = isWindows ? "\\" : "/";
  const root = normalize(dataRoot).replace(/[\\/]+$/, "");
  const line = normalize(commandLine);
  const datadirAt = line.indexOf(` --datadir ${root}${separator}`);
  return datadirAt >= 0 && GETH_EXECUTABLE_RE.test(line.slice(0, datadirAt));
}

/**
 * @param pid - A process ID.
 * @returns The process command line, or null when it cannot be read (gone).
 */
async function readCommandLine(pid: number): Promise<string | null> {
  try {
    if (process.platform === "linux") {
      return await readFile(`/proc/${pid}/cmdline`, "utf8");
    }
    const [command, args] =
      process.platform === "win32"
        ? [
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
            ],
          ]
        : // -ww: never truncate the command line to a column width.
          ["ps", ["-ww", "-o", "command=", "-p", String(pid)]];
    const { stdout } = await execFileAsync(command, args, {
      timeout: COMMAND_LINE_TIMEOUT_MS,
      windowsHide: true,
    });
    return stdout.trim() || null;
  } catch {
    // ps exits 1 and /proc has no entry when the process is gone.
    return null;
  }
}

/**
 * @param pid - A process ID.
 * @returns True while the process exists.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Sends a signal, treating a process that already exited as done. On Windows
 * every signal terminates the process outright.
 * @param pid - A process ID.
 * @param signal - The signal to send.
 */
function signalProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
  }
}

/**
 * @param pid - A process ID.
 * @param timeoutMs - How long to wait.
 * @returns True when the process exited within the timeout.
 */
async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, EXIT_POLL_INTERVAL_MS));
  }
  return true;
}

/**
 * @param pid - Our orphaned geth.
 * @param interruptHelper - geth-interrupt.exe, used on Windows only.
 * @returns False when geth could not be interrupted and must be killed.
 */
async function interruptOrphan(
  pid: number,
  interruptHelper: string | undefined,
): Promise<boolean> {
  if (process.platform !== "win32") {
    signalProcess(pid, "SIGINT");
    return true;
  }
  return (
    interruptHelper !== undefined &&
    (await interruptGethOnWindows(pid, interruptHelper))
  );
}

/**
 * Stops a geth left running by an earlier app process that died without
 * stopping it, so the new geth does not fail on the datadir lock (#73). Only a
 * process whose command line proves it is our geth is signalled; anything else
 * (a reused PID) is left alone and the stale record is dropped.
 * @param dataRoot - The folder holding every network's geth datadir.
 * @param gracefulTimeoutMs - Time between SIGINT and SIGKILL.
 * @param interruptHelper - geth-interrupt.exe, which stops geth cleanly on
 *   Windows (see gethInterrupt.ts); without it geth is killed there at once.
 * @returns Resolves once no recorded geth can still hold the datadir.
 * @throws When the recorded geth cannot be signalled (e.g. EPERM).
 */
export async function stopOrphanedGeth(
  dataRoot: string,
  gracefulTimeoutMs = GETH_GRACEFUL_TIMEOUT_MS,
  interruptHelper?: string,
): Promise<void> {
  const file = pidFilePath(dataRoot);
  let pid: number | null;
  try {
    pid = parsePidFile(readFileSync(file, "utf8"));
  } catch {
    return;
  }

  const commandLine = pid === null ? null : await readCommandLine(pid);
  if (
    pid !== null &&
    commandLine !== null &&
    isOwnGethCommandLine(commandLine, dataRoot, process.platform)
  ) {
    console.warn(`[geth:orphan] Stopping geth ${pid} left by a previous run`);
    const isInterrupted = await interruptOrphan(pid, interruptHelper);
    if (!isInterrupted || !(await waitForExit(pid, gracefulTimeoutMs))) {
      console.warn(`[geth:orphan] geth ${pid} is still running; killing it`);
      signalProcess(pid, "SIGKILL");
      await waitForExit(pid, KILL_SETTLE_TIMEOUT_MS);
    }
  }
  rmSync(file, { force: true });
}
