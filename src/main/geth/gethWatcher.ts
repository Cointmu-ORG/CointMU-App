/**
 * Stops geth when the app's main process dies (#73). Runs as its own process
 * (Electron in node mode, see gethWatcherProcess.ts) with its stdin piped from
 * the main process. However the main process ends (quit, SIGTERM, SIGKILL,
 * crash), the OS closes that pipe; the watcher then sends geth SIGINT and, if
 * geth is still running after the grace period, SIGKILL.
 *
 * Outside Windows it also holds the read ends of geth's stdout and stderr
 * (fds 3 and 4) and drains them once the main process is gone. Without a
 * reader, geth's next log line fails with SIGPIPE and kills it mid-shutdown,
 * leaving the chain database unclean.
 *
 * Its own build entry: it imports only node built-ins, so the bundle stays
 * small and shares no chunk with the main process.
 * usage: gethWatcher.js <gethPid> <gracefulTimeoutMs>
 */
import { Socket } from "node:net";

const LIVENESS_POLL_MS = 1000;
const EXIT_POLL_MS = 250;
const GETH_OUTPUT_FDS = [3, 4];
// Ctrl+C in a terminal or a session logout signals the whole process group;
// the watcher must outlive the main process to do its job.
const IGNORED_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function signalGeth(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    // Already gone; nothing left to stop.
  }
}

function drainGethOutput(): void {
  if (process.platform === "win32") return;
  GETH_OUTPUT_FDS.forEach((fd) => {
    const output = new Socket({ fd, readable: true, writable: false });
    // geth closing its end is the expected way for this to end.
    output.on("error", () => output.destroy());
    output.resume();
  });
}

function stopGeth(pid: number, gracefulTimeoutMs: number): void {
  drainGethOutput();
  signalGeth(pid, "SIGINT");
  const deadline = Date.now() + gracefulTimeoutMs;
  const poll = setInterval(() => {
    if (!isAlive(pid)) process.exit(0);
    if (Date.now() < deadline) return;
    clearInterval(poll);
    signalGeth(pid, "SIGKILL");
    process.exit(0);
  }, EXIT_POLL_MS);
}

function main(): void {
  const gethPid = Number(process.argv[2]);
  const gracefulTimeoutMs = Number(process.argv[3]);
  if (!Number.isSafeInteger(gethPid) || gethPid <= 0) process.exit(2);
  if (!Number.isFinite(gracefulTimeoutMs) || gracefulTimeoutMs < 0) {
    process.exit(2);
  }

  IGNORED_SIGNALS.forEach((signal) => process.on(signal, () => {}));

  // Ends quietly once geth exits on its own (restart, normal quit), so a later
  // pipe close can never signal a reused PID.
  const liveness = setInterval(() => {
    if (!isAlive(gethPid)) process.exit(0);
  }, LIVENESS_POLL_MS);

  let isStopping = false;
  const onParentGone = (): void => {
    if (isStopping) return;
    isStopping = true;
    clearInterval(liveness);
    stopGeth(gethPid, gracefulTimeoutMs);
  };
  process.stdin.on("end", onParentGone);
  process.stdin.on("close", onParentGone);
  // Windows reports a broken pipe as an error instead of end-of-file.
  process.stdin.on("error", onParentGone);
  process.stdin.resume();
}

main();
