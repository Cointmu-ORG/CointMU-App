import {
  spawn,
  type ChildProcess,
  type StdioOptions,
} from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EXIT_TIMEOUT_MS,
  PIPE_HOLDER,
  isAlive,
  makeWatcherDir,
  sleep,
  waitFor,
} from "./gethWatcher.fixtures";
import {
  watcherCommand,
  watcherStdio,
  type WatcherCommand,
} from "./gethWatcherProcess";

// Every case runs on real processes, once per watcher: the app's sh script,
// and the same script under GETH_WATCHER_SHELL when set. Windows has no
// watcher (see watcherCommand).
const EXTRA_SHELL = process.env.GETH_WATCHER_SHELL;
const SHORT_GRACE_MS = 300;
const LONG_GRACE_MS = 15_000;
// Past the sh watcher's 1 s poll, so a wrong reaction has time to happen.
const STILL_RUNNING_CHECK_MS = 1500;
const TEST_TIMEOUT_MS = 15_000;
const isWindows = process.platform === "win32";
const GROUP_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

type StdioEntry = Exclude<StdioOptions, string>[number];

interface WatcherVariant {
  name: string;
  command: () => WatcherCommand;
}

const VARIANTS: WatcherVariant[] = [
  { name: "the app's watcher", command: watcherCommand },
  ...(EXTRA_SHELL
    ? [
        {
          name: `the sh watcher under ${EXTRA_SHELL}`,
          command: () => ({ ...watcherCommand(), file: EXTRA_SHELL }),
        },
      ]
    : []),
];

describe.skipIf(isWindows).each(VARIANTS)("$name", ({ command }) => {
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
    const { file, args, env } = command();
    const layout = watcherStdio(geth);
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
        { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
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
    expect(existsSync(marker)).toBe(true);
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
            JSON.stringify(command()),
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

  it(
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

  it(
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

  it(
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
