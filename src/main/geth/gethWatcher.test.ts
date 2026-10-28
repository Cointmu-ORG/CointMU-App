import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startGethWatcher, watcherStdio } from "./gethWatcherProcess";

// Real processes on every OS: a fake geth, the watcher built from source, and
// for the SIGKILL case a fake main process that owns geth and the watcher.
// GETH_WATCHER_RUNTIME=<electron binary> runs that watcher the way the app
// does (Electron in node mode); the default is this node.
const WATCHER_RUNTIME = process.env.GETH_WATCHER_RUNTIME || process.execPath;
const SHORT_GRACE_MS = 300;
const STILL_RUNNING_CHECK_MS = 1500;
// Below vitest's 5 s test timeout, so a stuck process fails with its own message.
const EXIT_TIMEOUT_MS = 4000;
const POLL_MS = 100;
const isWindows = process.platform === "win32";

// On SIGINT it logs more than any pipe buffer holds, like geth's shutdown
// log, then records a clean stop. Without a reader on its stderr the write
// fails (EPIPE here, SIGPIPE for geth) or blocks, and the marker never appears.
const FAKE_GETH = `
const fs = require("node:fs");
const [marker, ignoreSigint] = process.argv.slice(2);
process.on("SIGINT", () => {
  if (ignoreSigint === "1") return;
  const line = Buffer.alloc(1024, "x");
  for (let i = 0; i < 1024; i++) fs.writeSync(2, line);
  fs.writeFileSync(marker, "clean");
  process.exit(0);
});
setInterval(() => {}, 1000);
process.stdout.write("ready");
`;

// Plays the app's main process: spawns geth with piped output it reads, and
// the watcher with the same stdio layout as startGethWatcher (watcherStdio).
const FAKE_MAIN = `
const { spawn } = require("node:child_process");
const [runtime, watcher, fakeGeth, marker, graceMs] = process.argv.slice(2);
const geth = spawn(process.execPath, [fakeGeth, marker, "0"], { stdio: ["ignore", "pipe", "pipe"] });
geth.stderr.resume();
geth.stdout.once("data", () => {
  geth.stdout.resume();
  const extra = process.platform === "win32" ? [] : [geth.stdout, geth.stderr];
  spawn(runtime, [watcher, String(geth.pid), graceMs], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["pipe", "ignore", "ignore", ...extra],
  });
  process.stdout.write(String(geth.pid));
});
setInterval(() => {}, 1000);
`;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + EXIT_TIMEOUT_MS;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

describe("watcherStdio", () => {
  const geth = spawn(process.execPath, ["-e", ""], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  it("shares geth's output pipes outside Windows", () => {
    expect(watcherStdio(geth, "linux")).toEqual([
      "pipe",
      "ignore",
      "ignore",
      geth.stdout,
      geth.stderr,
    ]);
  });

  it("only pipes stdin on Windows", () => {
    expect(watcherStdio(geth, "win32")).toEqual(["pipe", "ignore", "ignore"]);
  });
});

describe("geth watcher", () => {
  let dir: string;
  let marker: string;
  let children: ChildProcess[];
  let orphanPids: number[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cointmu-watcher-"));
    marker = join(dir, "clean");
    children = [];
    orphanPids = [];
    const source = await readFile(join(__dirname, "gethWatcher.ts"), "utf8");
    await writeFile(join(dir, "gethWatcher.js"), stripTypeScriptTypes(source));
    await writeFile(join(dir, "fake-geth.js"), FAKE_GETH);
    await writeFile(join(dir, "fake-main.js"), FAKE_MAIN);
  });

  afterEach(async () => {
    children.forEach((child) => child.kill("SIGKILL"));
    orphanPids.filter(isAlive).forEach((pid) => process.kill(pid, "SIGKILL"));
    await rm(dir, { recursive: true, force: true });
  });

  function track(child: ChildProcess | null): ChildProcess {
    if (child === null) throw new Error("the watcher did not start");
    children.push(child);
    return child;
  }

  async function startFakeGeth(ignoreSigint = false): Promise<ChildProcess> {
    const child = track(
      spawn(
        process.execPath,
        [join(dir, "fake-geth.js"), marker, ignoreSigint ? "1" : "0"],
        { stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
    child.stderr?.resume();
    await new Promise((resolve) => child.stdout?.once("data", resolve));
    return child;
  }

  function exitOf(
    child: ChildProcess,
  ): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`pid ${child.pid} still running`)),
        EXIT_TIMEOUT_MS,
      );
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
  }

  function expectCleanStop(): void {
    // Windows has no SIGINT for other processes: it terminates them.
    if (!isWindows) expect(existsSync(marker)).toBe(true);
  }

  it("stops geth with SIGINT once the main process closes its pipe", async () => {
    const geth = await startFakeGeth();
    const gethExit = exitOf(geth);
    const watcher = track(startGethWatcher(geth, dir));
    const watcherExit = exitOf(watcher);

    watcher.stdin?.destroy();

    await gethExit;
    expectCleanStop();
    expect((await watcherExit).code).toBe(0);
  });

  it("lets geth finish its shutdown log when the main process is SIGKILLed", async () => {
    const fakeMain = track(
      spawn(
        process.execPath,
        [
          join(dir, "fake-main.js"),
          WATCHER_RUNTIME,
          join(dir, "gethWatcher.js"),
          join(dir, "fake-geth.js"),
          marker,
          String(SHORT_GRACE_MS),
        ],
        { stdio: ["ignore", "pipe", "ignore"] },
      ),
    );
    const gethPid = Number(
      await new Promise((resolve) => fakeMain.stdout?.once("data", resolve)),
    );
    orphanPids.push(gethPid);

    fakeMain.kill("SIGKILL");

    await waitFor(() => !isAlive(gethPid), "geth to stop");
    expectCleanStop();
  });

  it.skipIf(isWindows)(
    "kills a geth that ignores SIGINT after the grace period",
    async () => {
      const geth = await startFakeGeth(true);
      const gethExit = exitOf(geth);
      const watcher = track(startGethWatcher(geth, dir, SHORT_GRACE_MS));

      watcher.stdin?.destroy();

      expect((await gethExit).signal).toBe("SIGKILL");
    },
  );

  it("leaves geth running while the main process lives", async () => {
    const geth = await startFakeGeth();
    track(startGethWatcher(geth, dir));

    await new Promise((resolve) => setTimeout(resolve, STILL_RUNNING_CHECK_MS));

    expect(geth.exitCode).toBeNull();
    expect(geth.signalCode).toBeNull();
  });

  it("leaves geth's output readable by the main process", async () => {
    const geth = track(
      spawn(
        process.execPath,
        ["-e", 'setInterval(() => process.stdout.write("tick"), 50)'],
        { stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
    let ticks = 0;
    geth.stdout?.on("data", () => ticks++);
    await waitFor(() => ticks > 0, "first output");
    track(startGethWatcher(geth, dir));
    const before = ticks;

    await waitFor(() => ticks > before, "output after the watcher started");
  });

  it("exits on its own once geth has exited", async () => {
    const geth = await startFakeGeth();
    const watcher = track(startGethWatcher(geth, dir));
    const watcherExit = exitOf(watcher);

    geth.kill("SIGKILL");

    expect((await watcherExit).code).toBe(0);
  });

  it("refuses an invalid geth PID", async () => {
    const watcher = track(
      spawn(process.execPath, [join(dir, "gethWatcher.js"), "0", "1"], {
        stdio: ["pipe", "ignore", "ignore"],
      }),
    );

    expect((await exitOf(watcher)).code).toBe(2);
  });
});
