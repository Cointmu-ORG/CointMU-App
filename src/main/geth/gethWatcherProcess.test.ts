import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "./gethWatcher.fixtures";
import {
  startGethWatcher,
  watcherCommand,
  watcherStdio,
} from "./gethWatcherProcess";

describe("watcherStdio", () => {
  const geth = spawn(process.execPath, ["-e", ""], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  it("shares geth's output pipes", () => {
    expect(watcherStdio(geth)).toEqual([
      "pipe",
      "ignore",
      "ignore",
      geth.stdout,
      geth.stderr,
    ]);
  });
});

describe("watcherCommand", () => {
  it("runs the sh watcher from /bin/sh with only system folders on PATH", () => {
    const command = watcherCommand();

    expect(command.file).toBe("/bin/sh");
    expect(command.args[0]).toBe("-c");
    expect(command.env).toEqual({ PATH: "/usr/bin:/bin" });
  });
});

// The app starts no watcher on Windows, which has no /bin/sh.
describe.skipIf(process.platform === "win32")("startGethWatcher", () => {
  let children: ChildProcess[];

  beforeEach(() => {
    children = [];
  });

  afterEach(() => {
    children.forEach((child) => child.kill("SIGKILL"));
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
    const watcher = startGethWatcher(geth);
    if (watcher === null) throw new Error("the watcher did not start");
    children.push(watcher);
    const before = ticks;

    await waitFor(() => ticks > before, "output after the watcher started");
  });
});
