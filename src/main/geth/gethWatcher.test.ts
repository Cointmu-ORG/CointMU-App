import {
  spawn,
  type ChildProcess,
  type StdioOptions,
} from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  startGethWatcher,
  watcherCommand,
  watcherStdio,
  type WatcherCommand,
} from "./gethWatcherProcess";

// Real processes on every OS: a fake geth, the watchers built from source, and
// for the SIGKILL case a fake main process that owns geth and the watcher.
// GETH_WATCHER_RUNTIME=<electron binary> runs the node watcher the way the app
// does on Windows (Electron in node mode); the default is this node.
// GETH_WATCHER_SHELL=<shell> also runs the sh watcher under that shell.
const WATCHER_RUNTIME = process.env.GETH_WATCHER_RUNTIME || process.execPath;
const EXTRA_SHELL = process.env.GETH_WATCHER_SHELL;
const SHORT_GRACE_MS = 300;
const LONG_GRACE_MS = 15_000;
// Past the sh watcher's 1 s poll, so a wrong reaction has time to happen.
const STILL_RUNNING_CHECK_MS = 1500;
// Room for the sh watcher's 1 s poll plus its drain, which restarts cat every
// 0.1 s on macOS's small socket buffers. Below the per-test timeout, so a stuck
// process fails with its own message.
const EXIT_TIMEOUT_MS = 8000;
const TEST_TIMEOUT_MS = 15_000;
const POLL_MS = 100;
const isWindows = process.platform === "win32";
const GROUP_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

// On SIGINT it logs 256 KB, more than geth's output socket holds (about 120 KB
// on Linux, 8-16 KB on macOS), like geth's shutdown log, then records a clean
// stop. Without a reader on its stderr the write
// fails (EPIPE here, SIGPIPE for geth) or blocks, and the marker never appears.
const FAKE_GETH = `
const fs = require("node:fs");
const [marker, ignoreSigint] = process.argv.slice(2);
process.on("SIGINT", () => {
  if (ignoreSigint === "1") return;
  const line = Buffer.alloc(1024, "x");
  for (let i = 0; i < 256; i++) fs.writeSync(2, line);
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
const [command, fakeGeth, marker, graceMs] = process.argv.slice(2);
const { file, args, env } = JSON.parse(command);
const geth = spawn(process.execPath, [fakeGeth, marker, "0"], { stdio: ["ignore", "pipe", "pipe"] });
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
const PIPE_HOLDER = `
const fs = require("node:fs");
setInterval(() => {
  try {
    fs.writeSync(1, "x");
  } catch (err) {
    process.exit(err.code === "EPIPE" ? 0 : 1);
  }
}, 50);
`;

type StdioEntry = Exclude<StdioOptions, string>[number];

interface WatcherVariant {
  name: string;
  command: (dir: string) => WatcherCommand;
}

const nodeWatcher = (dir: string): WatcherCommand => ({
  file: WATCHER_RUNTIME,
  args: [join(dir, "gethWatcher.js")],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});

const VARIANTS: WatcherVariant[] = [
  {
    name: `the app's watcher on ${process.platform}`,
    command: (dir) => watcherCommand(process.platform, dir),
  },
  // Windows already runs the node watcher above.
  ...(isWindows ? [] : [{ name: "the node watcher", command: nodeWatcher }]),
  ...(EXTRA_SHELL && !isWindows
    ? [
        {
          name: `the sh watcher under ${EXTRA_SHELL}`,
          command: (dir: string) => ({
            ...watcherCommand("linux", dir),
            file: EXTRA_SHELL,
          }),
        },
      ]
    : []),
];

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + EXIT_TIMEOUT_MS;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out: ${what}`);
    await sleep(POLL_MS);
  }
}

async function makeWatcherDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cointmu-watcher-"));
  const source = await readFile(join(__dirname, "gethWatcher.ts"), "utf8");
  await writeFile(join(dir, "gethWatcher.js"), stripTypeScriptTypes(source));
  await writeFile(join(dir, "fake-geth.js"), FAKE_GETH);
  await writeFile(join(dir, "fake-main.js"), FAKE_MAIN);
  return dir;
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

describe("watcherCommand", () => {
  it("runs the sh watcher from /bin/sh with only system folders on PATH", () => {
    const command = watcherCommand("linux", "/app/out/main");

    expect(command.file).toBe("/bin/sh");
    expect(command.args[0]).toBe("-c");
    expect(command.env).toEqual({ PATH: "/usr/bin:/bin" });
  });

  it("runs gethWatcher.js in node mode on Windows", () => {
    const command = watcherCommand("win32", "/app/out/main");

    expect(command.file).toBe(process.execPath);
    expect(command.args).toEqual([join("/app/out/main", "gethWatcher.js")]);
    expect(command.env.ELECTRON_RUN_AS_NODE).toBe("1");
  });
});

describe.each(VARIANTS)("$name", ({ command }) => {
  let dir: string;
  let marker: string;
  let children: ChildProcess[];
  let orphanPids: number[];

  beforeEach(async () => {
    dir = await makeWatcherDir();
    marker = join(dir, "clean");
    children = [];
    orphanPids = [];
  });

  afterEach(async () => {
    children.forEach((child) => child.kill("SIGKILL"));
    orphanPids.filter(isAlive).forEach((pid) => process.kill(pid, "SIGKILL"));
    await rm(dir, { recursive: true, force: true });
  });

  function track(child: ChildProcess): ChildProcess {
    children.push(child);
    return child;
  }

  // The watcher with startGethWatcher's stdio, given raw arguments.
  function startWatcher(
    geth: ChildProcess,
    gethPid: string,
    graceMs: string,
    stdin: StdioEntry = "pipe",
  ): ChildProcess {
    const { file, args, env } = command(dir);
    const layout = watcherStdio(geth, process.platform);
    if (!Array.isArray(layout)) throw new Error("expected a stdio array");
    const stdio: StdioEntry[] = [stdin, ...layout.slice(1)];
    return track(spawn(file, [...args, gethPid, graceMs], { env, stdio }));
  }

  function watch(geth: ChildProcess, graceMs = LONG_GRACE_MS): ChildProcess {
    return startWatcher(geth, String(geth.pid), String(graceMs));
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

  it(
    "stops geth with SIGINT once the main process closes its pipe",
    async () => {
      const geth = await startFakeGeth();
      const gethExit = exitOf(geth);
      const watcher = watch(geth);
      const watcherExit = exitOf(watcher);

      watcher.stdin?.destroy();

      await gethExit;
      expectCleanStop();
      expect((await watcherExit).code).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "lets geth finish its shutdown log when the main process is SIGKILLed",
    async () => {
      const fakeMain = track(
        spawn(
          process.execPath,
          [
            join(dir, "fake-main.js"),
            JSON.stringify(command(dir)),
            join(dir, "fake-geth.js"),
            marker,
            String(LONG_GRACE_MS),
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
    },
    TEST_TIMEOUT_MS,
  );

  it.skipIf(isWindows)(
    "kills a geth that ignores SIGINT after the grace period",
    async () => {
      const geth = await startFakeGeth(true);
      const gethExit = exitOf(geth);
      const watcher = watch(geth, SHORT_GRACE_MS);

      watcher.stdin?.destroy();

      expect((await gethExit).signal).toBe("SIGKILL");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "leaves geth running while the main process lives",
    async () => {
      const geth = await startFakeGeth();
      watch(geth);

      await sleep(STILL_RUNNING_CHECK_MS);

      expect(geth.exitCode).toBeNull();
      expect(geth.signalCode).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it.skipIf(isWindows)(
    "ignores the signals a terminal or logout sends to the process group",
    async () => {
      const geth = await startFakeGeth();
      const watcher = watch(geth);
      // Lets the watcher install its handlers before the signals arrive.
      await sleep(STILL_RUNNING_CHECK_MS);

      GROUP_SIGNALS.forEach((signal) => watcher.kill(signal));
      await sleep(STILL_RUNNING_CHECK_MS);

      expect(watcher.exitCode).toBeNull();
      expect(watcher.signalCode).toBeNull();
      expect(geth.exitCode).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "exits on its own once geth has exited",
    async () => {
      const geth = await startFakeGeth();
      const watcher = watch(geth);
      const watcherExit = exitOf(watcher);

      geth.kill("SIGKILL");

      expect((await watcherExit).code).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it.skipIf(isWindows)(
    "leaves nothing reading the main process's pipe once it has exited",
    async () => {
      const geth = await startFakeGeth();
      const holder = track(
        spawn(process.execPath, ["-e", PIPE_HOLDER], {
          stdio: ["ignore", "pipe", "ignore"],
        }),
      );
      const watcher = startWatcher(
        geth,
        String(geth.pid),
        String(LONG_GRACE_MS),
        holder.stdout,
      );
      // Only the watcher reads the holder's output from here on.
      holder.stdout?.destroy();
      const watcherExit = exitOf(watcher);

      geth.kill("SIGKILL");
      await watcherExit;

      expect((await exitOf(holder)).code).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it("refuses an invalid geth PID", async () => {
    const geth = await startFakeGeth();
    const watcher = startWatcher(geth, "0", "1");

    expect((await exitOf(watcher)).code).toBe(2);
  });

  it("refuses an invalid grace period", async () => {
    const geth = await startFakeGeth();
    const watcher = startWatcher(geth, String(geth.pid), "soon");

    expect((await exitOf(watcher)).code).toBe(2);
  });
});

describe("startGethWatcher", () => {
  let dir: string;
  let children: ChildProcess[];

  beforeEach(async () => {
    dir = await makeWatcherDir();
    children = [];
  });

  afterEach(async () => {
    children.forEach((child) => child.kill("SIGKILL"));
    await rm(dir, { recursive: true, force: true });
  });

  it("leaves geth's output readable by the main process", async () => {
    const geth = spawn(
      process.execPath,
      ["-e", 'setInterval(() => process.stdout.write("tick"), 50)'],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    children.push(geth);
    let ticks = 0;
    geth.stdout?.on("data", () => ticks++);
    await waitFor(() => ticks > 0, "first output");
    const watcher = startGethWatcher(geth, dir);
    if (watcher === null) throw new Error("the watcher did not start");
    children.push(watcher);
    const before = ticks;

    await waitFor(() => ticks > before, "output after the watcher started");
  });
});
