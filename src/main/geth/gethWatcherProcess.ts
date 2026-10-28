import {
  spawn,
  type ChildProcess,
  type StdioOptions,
} from "node:child_process";
import { join } from "node:path";
import { GETH_GRACEFUL_TIMEOUT_MS } from "./orphanedGeth";
import { GETH_WATCHER_SH } from "./gethWatcherScript";

const WATCHER_SCRIPT = "gethWatcher.js";
const POSIX_SHELL = "/bin/sh";
// Shown as the shell's $0 in ps, and in its error messages.
const SHELL_WATCHER_NAME = "cointmu-geth-watcher";
// Only the system's own folders: an AppImage's AppRun puts its mount on PATH
// and LD_LIBRARY_PATH, and the watcher must not load anything from there.
const SHELL_WATCHER_PATH = "/usr/bin:/bin";

/** How to start the watcher; geth's PID and the grace period follow `args`. */
export interface WatcherCommand {
  file: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/**
 * Picks the watcher per OS: the sh script (gethWatcherScript.ts) outside
 * Windows, gethWatcher.js on Windows, which has no /bin/sh. The Windows one
 * runs the app binary in node mode, so it depends on the RunAsNode Electron
 * fuse staying enabled; hardening that fuse means replacing it there (Job
 * Object, native helper).
 * @param platform - Selects the watcher.
 * @param scriptDir - The folder holding the built gethWatcher.js.
 * @returns The command, without geth's PID and the grace period.
 */
export function watcherCommand(
  platform: NodeJS.Platform,
  scriptDir: string,
): WatcherCommand {
  if (platform === "win32") {
    return {
      file: process.execPath,
      args: [join(scriptDir, WATCHER_SCRIPT)],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    };
  }
  return {
    file: POSIX_SHELL,
    args: ["-c", GETH_WATCHER_SH, SHELL_WATCHER_NAME],
    env: { PATH: SHELL_WATCHER_PATH },
  };
}

/**
 * The watcher's stdio: stdin is the pipe whose end-of-file means this process
 * is gone. Outside Windows, fds 3 and 4 share geth's stdout and stderr pipes so
 * geth keeps a reader after this process dies (see gethWatcherScript.ts).
 * Windows has no SIGPIPE, and its SIGINT already terminates geth outright.
 * @param geth - The geth child process, spawned with piped stdout and stderr.
 * @param platform - Selects the layout.
 * @returns The stdio layout for spawn().
 */
export function watcherStdio(
  geth: ChildProcess,
  platform: NodeJS.Platform,
): StdioOptions {
  const base: StdioOptions = ["pipe", "ignore", "ignore"];
  if (platform === "win32" || !geth.stdout || !geth.stderr) return base;
  return [...base, geth.stdout, geth.stderr];
}

/**
 * Starts the watcher that stops geth if this process dies without stopping it
 * (see watcherCommand). This process keeps the watcher's stdin open for its
 * whole life and never writes to it. Call it after geth's output listeners are
 * attached: it resumes reading that output.
 * @param geth - The geth child process just spawned.
 * @param scriptDir - The folder holding the built gethWatcher.js (the main
 *   bundle's); only used on Windows.
 * @param gracefulTimeoutMs - Time between SIGINT and SIGKILL.
 * @returns The watcher process, or null when it could not be started.
 */
export function startGethWatcher(
  geth: ChildProcess,
  scriptDir: string = __dirname,
  gracefulTimeoutMs = GETH_GRACEFUL_TIMEOUT_MS,
): ChildProcess | null {
  if (geth.pid === undefined) return null;
  try {
    const command = watcherCommand(process.platform, scriptDir);
    const watcher = spawn(
      command.file,
      [...command.args, String(geth.pid), String(gracefulTimeoutMs)],
      {
        env: command.env,
        stdio: watcherStdio(geth, process.platform),
        windowsHide: true,
      },
    );
    watcher.on("error", (err) => {
      console.warn("[geth:watcher] The geth watcher failed:", err);
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
