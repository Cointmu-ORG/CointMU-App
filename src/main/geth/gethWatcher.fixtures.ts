// Real processes for the geth watcher tests: a fake geth, a fake main process
// that owns geth and a watcher, and the node watcher built from source.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Room for the sh watcher's 1 s poll plus its drain, which restarts cat every
// 0.1 s on macOS's small socket buffers. Below the per-test timeout, so a stuck
// process fails with its own message.
export const EXIT_TIMEOUT_MS = 8000;
const POLL_MS = 100;

// On SIGINT it logs 256 KB, more than geth's output socket holds (about 120 KB
// on Linux, 8-16 KB on macOS), like geth's shutdown log, then records a clean
// stop. Without a reader on its stderr the write fails (EPIPE here, SIGPIPE
// for geth) or blocks, and the marker never appears. Node reports the
// CTRL_BREAK from geth-interrupt.exe as SIGBREAK; geth reports it as SIGINT.
const FAKE_GETH = `
const fs = require("node:fs");
const [marker, ignoreSigint] = process.argv.slice(2);
const stop = () => {
  if (ignoreSigint === "1") return;
  const line = Buffer.alloc(1024, "x");
  for (let i = 0; i < 256; i++) fs.writeSync(2, line);
  fs.writeFileSync(marker, "clean");
  process.exit(0);
};
process.on("SIGINT", stop);
if (process.platform === "win32") process.on("SIGBREAK", stop);
setInterval(() => {}, 1000);
process.stdout.write("ready");
`;

// Plays the app's main process: spawns geth with piped output it reads, and
// the watcher with the same stdio layout as startGethWatcher (watcherStdio).
const FAKE_MAIN = `
const { spawn } = require("node:child_process");
const [command, fakeGeth, marker, graceMs] = process.argv.slice(2);
const { file, args, env } = JSON.parse(command);
const geth = spawn(process.execPath, [fakeGeth, marker, "0"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
geth.stderr.resume();
geth.stdout.once("data", () => {
  geth.stdout.resume();
  const extra = process.platform === "win32" ? [] : [geth.stdout, geth.stderr];
  spawn(file, [...args, String(geth.pid), graceMs], {
    env,
    stdio: ["pipe", "ignore", "ignore", ...extra],
  });
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
  const source = await readFile(join(__dirname, "gethWatcher.ts"), "utf8");
  await writeFile(join(dir, "gethWatcher.js"), stripTypeScriptTypes(source));
  await writeFile(join(dir, "fake-geth.js"), FAKE_GETH);
  await writeFile(join(dir, "fake-main.js"), FAKE_MAIN);
  return dir;
}
