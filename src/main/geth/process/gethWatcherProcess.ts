import {
  spawn,
  type ChildProcess,
  type StdioOptions,
} from "node:child_process";
import { GETH_GRACEFUL_TIMEOUT_MS } from "./orphanedGeth";
import { GETH_WATCHER_SH } from "./gethWatcherScript";
import { GETH_READY_WAIT_MS } from "./gethReadiness";

const POSIX_SHELL = "/bin/sh";
// Shown as the shell's $0 in ps, and in its error messages.
const SHELL_WATCHER_NAME = "cointmu-geth-watcher";
// Only the system's own folders: an AppImage's AppRun puts its mount on PATH
// and LD_LIBRARY_PATH, and the watcher must not load anything from there.
const SHELL_WATCHER_PATH = "/usr/bin:/bin";

/**
 * How to start the watcher; geth's PID, the grace period and the ready wait
 * follow `args`.
 */
export interface WatcherCommand {
  file: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/**
 * The watcher outside Windows: the sh script (gethWatcherScript.ts). Windows
 * has none: libuv puts every non-detached child (geth, a watcher) in a job
 * that Windows terminates with this process, so geth-supervisor.exe
 * (native/geth-supervisor) does this job there.
 * @returns The command, without geth's PID, the grace period and the ready
 *   wait.
 */
export function watcherCommand(): WatcherCommand {
  return {
    file: POSIX_SHELL,
    args: ["-c", GETH_WATCHER_SH, SHELL_WATCHER_NAME],
    env: { PATH: SHELL_WATCHER_PATH },
  };
}

/**
 * The watcher's stdio: stdin is the pipe whose end-of-file means this process
 * is gone. fds 3 and 4 share geth's stdout and stderr pipes so geth keeps a
 * reader after this process dies (see gethWatcherScript.ts).
 * @param geth - The geth child process, spawned with piped stdout and stderr.
 * @returns The stdio layout for spawn().
 */
export function watcherStdio(geth: ChildProcess): StdioOptions {
  const base: StdioOptions = ["pipe", "ignore", "ignore"];
  if (!geth.stdout || !geth.stderr) return base;
  return [...base, geth.stdout, geth.stderr];
}

/**
 * Starts the watcher that stops geth if this process dies without stopping it
 * (see watcherCommand). This process keeps the watcher's stdin open for its
 * whole life and writes to it only through reportGethReady. Call it after
 * geth's output listeners are attached: it resumes reading that output. Not on
 * Windows.
 * @param geth - The geth child process just spawned.
 * @param gracefulTimeoutMs - Time between SIGINT and SIGKILL.
 * @param readyWaitMs - How long the watcher waits for a geth that is still
 *   starting before it interrupts it (see gethReadiness.ts).
 * @returns The watcher process, or null when it could not be started.
 */
export function startGethWatcher(
  geth: ChildProcess,
  gracefulTimeoutMs = GETH_GRACEFUL_TIMEOUT_MS,
  readyWaitMs = GETH_READY_WAIT_MS,
): ChildProcess | null {
  if (geth.pid === undefined) return null;
  try {
    const command = watcherCommand();
    const watcher = spawn(
      command.file,
      [
        ...command.args,
        String(geth.pid),
        String(gracefulTimeoutMs),
        String(readyWaitMs),
      ],
      {
        env: command.env,
        stdio: watcherStdio(geth),
        windowsHide: true,
      },
    );
    watcher.on("error", (err) => {
      console.warn("[geth:watcher] The geth watcher failed:", err);
    });
    // EPIPE from reportGethReady once the watcher has exited.
    watcher.stdin?.on("error", (err) => {
      console.warn("[geth:watcher] Could not reach the geth watcher:", err);
    });
    // spawn() stops this process reading a stream it hands to a child; geth's
    // output still feeds the log parser and recovery here, so read on.
    geth.stdout?.resume();
    geth.stderr?.resume();
    return watcher;
  } catch (err) {
    console.warn("[geth:watcher] Could not start the geth watcher:", err);
    return null;
  }
}

/**
 * Tells the watcher that geth has logged GETH_READY_LOG, so once this process
 * is gone it can interrupt geth without reading geth's log first.
 * @param watcher - The watcher from startGethWatcher, or null.
 */
export function reportGethReady(watcher: ChildProcess | null): void {
  watcher?.stdin?.write("\n");
}
