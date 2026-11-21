// Real processes for the geth watcher tests: a fake geth, a fake main process
// that owns geth and a watcher.
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GETH_READY_LOG } from "./gethReadiness";

// Room for the sh watcher's 1 s poll plus its drain, which restarts cat every
// 0.1 s on macOS's small socket buffers. Below the per-test timeout, so a stuck
// process fails with its own message.
export const EXIT_TIMEOUT_MS = 8000;
const POLL_MS = 100;

// Like geth, it takes SIGINT only once it has logged GETH_READY_LOG, after
// readyDelayMs ("never": it does not); a SIGINT before that ends it at once.
// On SIGINT it logs 256 KB, more than geth's output socket holds (about 120 KB
// on Linux, 8-16 KB on macOS), like geth's shutdown log, then records a clean
// stop. Without a reader on its stderr the write fails (EPIPE here, SIGPIPE
// for geth) or blocks, and the marker never appears.
const FAKE_GETH = `
const fs = require("node:fs");
const [marker, ignoreSigint, readyDelayMs] = process.argv.slice(2);
function becomeReady() {
  fs.writeSync(2, "INFO ${GETH_READY_LOG}\\n");
  process.on("SIGINT", () => {
    if (ignoreSigint === "1") return;
    const line = Buffer.alloc(1024, "x");
    for (let i = 0; i < 256; i++) fs.writeSync(2, line);
    fs.writeFileSync(marker, "clean");
    process.exit(0);
  });
}
if (readyDelayMs === "0") becomeReady();
else if (readyDelayMs !== "never") setTimeout(becomeReady, Number(readyDelayMs));
setInterval(() => {}, 1000);
process.stdout.write("ready");
`;

// Plays the app's main process: spawns geth with piped output it reads, and
// the watcher with the same stdio layout as startGethWatcher (watcherStdio),
// and reports geth ready to it like reportGethReady.
const FAKE_MAIN = `
const { spawn } = require("node:child_process");
const [command, fakeGeth, marker, graceMs, readyWaitMs] = process.argv.slice(2);
const { file, args, env } = JSON.parse(command);
const geth = spawn(process.execPath, [fakeGeth, marker, "0", "0"], { stdio: ["ignore", "pipe", "pipe"] });
let isReady = false;
let watcher = null;
geth.stderr.on("data", (data) => {
  if (isReady || !data.includes("${GETH_READY_LOG}")) return;
  isReady = true;
  watcher?.stdin.write("\\n");
});
geth.stdout.once("data", () => {
  geth.stdout.resume();
  watcher = spawn(file, [...args, String(geth.pid), graceMs, readyWaitMs], {
    env,
    stdio: ["pipe", "ignore", "ignore", geth.stdout, geth.stderr],
  });
  if (isReady) watcher.stdin.write("\\n");
  process.stdout.write(String(geth.pid));
});
setInterval(() => {}, 1000);
`;

// Plays the main process's end of the watcher's stdin: writes until nothing
// reads it any more, then exits 0 on EPIPE.
export const PIPE_HOLDER = `
const fs = require("node:fs");
setInterval(() => {
  try {
    fs.writeSync(1, "x");
  } catch (err) {
    process.exit(err.code === "EPIPE" ? 0 : 1);
  }
}, 50);
`;

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export async function waitFor(
  condition: () => boolean,
  what: string,
): Promise<void> {
  const deadline = Date.now() + EXIT_TIMEOUT_MS;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out: ${what}`);
    await sleep(POLL_MS);
  }
}

export async function makeWatcherDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cointmu-watcher-"));
  await writeFile(join(dir, "fake-geth.js"), FAKE_GETH);
  await writeFile(join(dir, "fake-main.js"), FAKE_MAIN);
  return dir;
}
