import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { constants, setPriority } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CHILD_LOOKUP_TIMEOUT_MS = 10_000;
// Nice 10 on Linux and macOS; BELOW_NORMAL_PRIORITY_CLASS on Windows.
const LOW = constants.priority.PRIORITY_BELOW_NORMAL;
const NORMAL = constants.priority.PRIORITY_NORMAL;

/** What applying a priority needs from the OS; tests pass fakes. */
export interface PriorityDeps {
  readonly platform: NodeJS.Platform;
  readonly setPriority: (pid: number, priority: number) => void;
  /** Linux: every thread of the process (nice is per thread there). */
  readonly listThreads: (pid: number) => Promise<number[]>;
  /** Windows: geth.exe started by geth-supervisor.exe, or null. */
  readonly findWindowsChild: (supervisorPid: number) => Promise<number | null>;
}

/** The outcome; raising a priority back needs privileges on Linux/macOS. */
export type PriorityResult = "applied" | "needs-restart";

/**
 * @param err - What os.setPriority threw.
 * @returns The errno name: Node's SystemError keeps it in info.code.
 */
function systemErrorCode(err: unknown): string | undefined {
  const failure = err as { code?: string; info?: { code?: string } };
  return failure.info?.code ?? failure.code;
}

async function listLinuxThreads(pid: number): Promise<number[]> {
  const tasks = await readdir(`/proc/${pid}/task`);
  return tasks.map(Number).filter(Number.isInteger);
}

async function findWindowsGethChild(
  supervisorPid: number,
): Promise<number | null> {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${supervisorPid} AND Name='geth.exe'").ProcessId`,
    ],
    { timeout: CHILD_LOOKUP_TIMEOUT_MS, windowsHide: true },
  );
  const pid = Number(stdout.trim().split(/\s+/)[0]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

const SYSTEM_DEPS: PriorityDeps = {
  platform: process.platform,
  setPriority,
  listThreads: listLinuxThreads,
  findWindowsChild: findWindowsGethChild,
};

/**
 * @param pid - The PID geth was spawned as (geth-supervisor.exe on Windows).
 * @param deps - OS access.
 * @returns Every PID or thread ID the priority must be set on.
 */
async function priorityTargets(
  pid: number,
  deps: PriorityDeps,
): Promise<number[]> {
  if (deps.platform === "linux") return deps.listThreads(pid);
  if (deps.platform !== "win32") return [pid];
  const child = await deps.findWindowsChild(pid);
  return child === null ? [pid] : [pid, child];
}

/**
 * Sets geth's CPU priority: below normal (low) or normal. On Linux every
 * thread is reniced, since nice is per thread there and geth's threads
 * already exist; on Windows both geth-supervisor.exe and its geth.exe.
 * Raising it back to normal needs privileges on Linux and macOS, so that
 * reports "needs-restart": a newly spawned geth starts at normal.
 * @param pid - The PID geth was spawned as.
 * @param isLow - Below normal (true) or normal.
 * @param deps - OS access.
 * @returns Whether it was applied or needs a geth restart.
 */
export async function applyGethPriority(
  pid: number,
  isLow: boolean,
  deps: PriorityDeps = SYSTEM_DEPS,
): Promise<PriorityResult> {
  const priority = isLow ? LOW : NORMAL;
  for (const target of await priorityTargets(pid, deps)) {
    try {
      deps.setPriority(target, priority);
    } catch (err) {
      const code = systemErrorCode(err);
      if (!isLow && (code === "EACCES" || code === "EPERM")) {
        return "needs-restart";
      }
      // A thread that ended meanwhile is fine; anything else is logged.
      if (code !== "ESRCH") {
        console.warn(`[geth:priority] Could not set ${target}:`, err);
      }
    }
  }
  return "applied";
}
