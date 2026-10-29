import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeWatcherDir, waitFor } from "./gethWatcher.fixtures";
import {
  startGethWatcher,
  watcherCommand,
  watcherStdio,
} from "./gethWatcherProcess";

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
