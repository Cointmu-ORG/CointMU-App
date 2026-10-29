import { execFile } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import ms from "ms";
import { interruptGethOnWindows } from "./gethSupervisor";

/** How long geth gets to close its database after SIGINT before SIGKILL. */
export const GETH_GRACEFUL_TIMEOUT_MS = ms("15s");
/**
 * geth-supervisor.exe kills geth itself after the grace period; killing the
 * supervisor (which takes geth with it) waits this much longer, so its own
 * kill comes first.
 */
export const SUPERVISOR_EXIT_MARGIN_MS = ms("5s");
const SUPERVISOR_EXECUTABLE = "geth-supervisor.exe";
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
 * @param commandLine - A Windows command line, as Win32_Process reports it.
 * @returns True when its executable (the first, possibly quoted, token) is
 *   geth-supervisor.exe, not when the name only appears in an argument.
 */
export function isSupervisorCommandLine(commandLine: string): boolean {
  const line = commandLine.trim();
  const executable = line.startsWith('"')
    ? line.slice(1, line.indexOf('"', 1))
    : line.split(/\s/, 1)[0];
  const name = executable.split(/[\\/]/).pop() ?? "";
  return name.toLowerCase() === SUPERVISOR_EXECUTABLE;
}

/**
 * How to stop an orphan, by what the PID file names (both pass
 * isOwnGethCommandLine: the supervisor's command line holds geth's).
 * - signal: geth outside Windows, SIGINT.
 * - await-supervisor: geth-supervisor.exe. Its stdin closed when the app that
 *   started it went away, so it is already stopping geth; wait for it.
 * - interrupt: a geth.exe without a supervisor (written by an older version):
 *   `geth-supervisor.exe interrupt`.
 */
export type OrphanStopMethod = "signal" | "await-supervisor" | "interrupt";

/**
 * @param commandLine - The orphan's command line.
 * @param platform - Selects the method.
 * @returns How to stop it.
 */
export function orphanStopMethod(
  commandLine: string,
  platform: NodeJS.Platform,
): OrphanStopMethod {
  if (platform !== "win32") return "signal";
  return isSupervisorCommandLine(commandLine)
    ? "await-supervisor"
    : "interrupt";
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
 * @param pid - Our orphaned geth or its supervisor.
 * @param method - See orphanStopMethod.
 * @param supervisor - geth-supervisor.exe, for the interrupt method.
 * @returns False when the orphan could not be stopped cleanly and must be
 *   killed.
 */
async function beginOrphanStop(
  pid: number,
  method: OrphanStopMethod,
  supervisor: string | undefined,
): Promise<boolean> {
  if (method === "signal") {
    signalProcess(pid, "SIGINT");
    return true;
  }
  if (method === "await-supervisor") return true;
  return (
    supervisor !== undefined && (await interruptGethOnWindows(pid, supervisor))
  );
}

/**
 * Stops a geth left running by an earlier app process that died without
 * stopping it, so the new geth does not fail on the datadir lock (#73). Only a
 * process whose command line proves it is our geth is signalled; anything else
 * (a reused PID) is left alone and the stale record is dropped.
 * @param dataRoot - The folder holding every network's geth datadir.
 * @param gracefulTimeoutMs - Time between SIGINT and SIGKILL.
 * @param supervisor - geth-supervisor.exe, which stops an unsupervised geth
 *   cleanly on Windows; without it such a geth is killed there at once.
 * @returns Resolves once no recorded geth can still hold the datadir.
 * @throws When the recorded geth cannot be signalled (e.g. EPERM).
 */
export async function stopOrphanedGeth(
  dataRoot: string,
  gracefulTimeoutMs = GETH_GRACEFUL_TIMEOUT_MS,
  supervisor?: string,
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
    const method = orphanStopMethod(commandLine, process.platform);
    const isStopping = await beginOrphanStop(pid, method, supervisor);
    const waitMs =
      method === "await-supervisor"
        ? gracefulTimeoutMs + SUPERVISOR_EXIT_MARGIN_MS
        : gracefulTimeoutMs;
    if (!isStopping || !(await waitForExit(pid, waitMs))) {
      console.warn(`[geth:orphan] geth ${pid} is still running; killing it`);
      signalProcess(pid, "SIGKILL");
      await waitForExit(pid, KILL_SETTLE_TIMEOUT_MS);
    }
  }
  rmSync(file, { force: true });
}
