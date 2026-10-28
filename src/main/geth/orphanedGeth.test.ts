import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isOwnGethCommandLine,
  parsePidFile,
  removeGethPidFile,
  stopOrphanedGeth,
  writeGethPidFile,
} from "./orphanedGeth";

const LINUX_ROOT = "/home/u/.config/CointMU/cointmu-chaindata";
const MAC_ROOT =
  "/Users/u/Library/Application Support/CointMU/cointmu-chaindata";
const WIN_ROOT = "C:\\Users\\u\\AppData\\Roaming\\CointMU\\cointmu-chaindata";
const SHORT_GRACE_MS = 300;

describe("parsePidFile", () => {
  it.each([
    ["4242", 4242],
    [" 4242\n", 4242],
    ["", null],
    ["0", null],
    ["-1", null],
    ["12abc", null],
    ["99999999999999999999", null],
  ])("parses %j as %j", (text, pid) => {
    expect(parsePidFile(text)).toBe(pid);
  });
});

describe("isOwnGethCommandLine", () => {
  it("accepts our geth on Linux (NUL-separated /proc cmdline)", () => {
    const line = [
      "/tmp/.mount_CointMabc/resources/bin/linux/geth",
      "--networkid",
      "1912",
      "--datadir",
      `${LINUX_ROOT}/1912`,
      "",
    ].join("\0");
    expect(isOwnGethCommandLine(line, LINUX_ROOT, "linux")).toBe(true);
  });

  it("accepts our geth on macOS, whose data root contains a space", () => {
    const line = `/Applications/CointMU.app/Contents/Resources/bin/mac/geth --networkid 1912 --datadir ${MAC_ROOT}/1912 --port 30303`;
    expect(isOwnGethCommandLine(line, MAC_ROOT, "darwin")).toBe(true);
  });

  it("accepts our geth on Windows: quoted paths, any case", () => {
    const line = `"C:\\Program Files\\CointMU\\resources\\bin\\win\\GETH.EXE" --networkid 1912 --datadir "${WIN_ROOT.toLowerCase()}\\1912" --port 30303`;
    expect(isOwnGethCommandLine(line, WIN_ROOT, "win32")).toBe(true);
  });

  it.each([
    ["another program", `/usr/bin/sleep --datadir ${LINUX_ROOT}/1912`],
    ["geth on another datadir", `/usr/bin/geth --datadir /srv/geth/1912`],
    [
      "a sibling folder sharing the prefix",
      `/usr/bin/geth --datadir ${LINUX_ROOT}-old/1912`,
    ],
    ["geth without a datadir", "/usr/bin/geth --networkid 1912"],
    [
      "a program whose name only ends in geth",
      `/usr/bin/notgeth --datadir ${LINUX_ROOT}/1912`,
    ],
    ["an empty command line", ""],
  ])("rejects %s", (_, line) => {
    expect(isOwnGethCommandLine(line, LINUX_ROOT, "linux")).toBe(false);
  });

  it("accepts a macOS install under a folder with spaces (ps adds no quotes)", () => {
    const line = `/Users/u/My Apps/CointMU.app/Contents/Resources/bin/mac/geth --networkid 1912 --datadir ${MAC_ROOT}/1912`;
    expect(isOwnGethCommandLine(line, MAC_ROOT, "darwin")).toBe(true);
  });

  it("is case-sensitive outside Windows", () => {
    const line = `/usr/bin/geth --datadir ${LINUX_ROOT.toUpperCase()}/1912`;
    expect(isOwnGethCommandLine(line, LINUX_ROOT, "linux")).toBe(false);
  });
});

describe("PID file", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "cointmu-pid-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("is removed by the geth it names", async () => {
    writeGethPidFile(root, 4242);
    expect(await readFile(join(root, "geth.pid"), "utf8")).toBe("4242");

    removeGethPidFile(root, 4242);

    expect(existsSync(join(root, "geth.pid"))).toBe(false);
  });

  it("is kept when a newer geth already replaced it", () => {
    writeGethPidFile(root, 5000);

    removeGethPidFile(root, 4242);

    expect(existsSync(join(root, "geth.pid"))).toBe(true);
  });
});

// Real processes: a symlink named "geth" to node gives a process whose
// /proc cmdline looks like ours, so the identity check and signals are real.
describe.runIf(process.platform === "linux")("stopOrphanedGeth", () => {
  let root: string;
  let children: ChildProcess[];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "cointmu-orphan-"));
    children = [];
    await symlink(process.execPath, join(root, "geth"));
  });

  afterEach(async () => {
    children.forEach((child) => child.kill("SIGKILL"));
    await rm(root, { recursive: true, force: true });
  });

  /** Starts a fake geth and resolves once its SIGINT handler is installed. */
  async function startFakeGeth(options: {
    datadir: string;
    ignoreSigint?: boolean;
  }): Promise<ChildProcess> {
    const script = join(root, "fake-geth.js");
    const onSigint = options.ignoreSigint ? "" : "process.exit(0)";
    await writeFile(
      script,
      `process.on("SIGINT", () => { ${onSigint} });
       setInterval(() => {}, 1000);
       process.stdout.write("ready");`,
    );
    const child = spawn(
      join(root, "geth"),
      [script, "--datadir", options.datadir],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    children.push(child);
    await new Promise((resolve) => child.stdout?.once("data", resolve));
    return child;
  }

  /** Resolves with the signal that ended the child (null for a clean exit). */
  function exitSignal(child: ChildProcess): Promise<NodeJS.Signals | null> {
    return new Promise((resolve) =>
      child.once("exit", (_, signal) => resolve(signal)),
    );
  }

  it("stops our leftover geth with SIGINT and clears the record", async () => {
    const geth = await startFakeGeth({ datadir: join(root, "1912") });
    const exited = exitSignal(geth);
    writeGethPidFile(root, geth.pid ?? -1);

    await stopOrphanedGeth(root, SHORT_GRACE_MS);

    expect(await exited).toBeNull();
    expect(geth.exitCode).toBe(0);
    expect(existsSync(join(root, "geth.pid"))).toBe(false);
  });

  it("kills a geth that ignores SIGINT", async () => {
    const geth = await startFakeGeth({
      datadir: join(root, "1912"),
      ignoreSigint: true,
    });
    const exited = exitSignal(geth);
    writeGethPidFile(root, geth.pid ?? -1);

    await stopOrphanedGeth(root, SHORT_GRACE_MS);

    expect(await exited).toBe("SIGKILL");
  });

  it("leaves a process that is not our geth alone", async () => {
    const other = await startFakeGeth({ datadir: "/srv/other-geth" });
    writeGethPidFile(root, other.pid ?? -1);

    await stopOrphanedGeth(root, SHORT_GRACE_MS);

    expect(other.exitCode).toBeNull();
    expect(other.signalCode).toBeNull();
    expect(existsSync(join(root, "geth.pid"))).toBe(false);
  });

  it("drops the record of a geth that is already gone", async () => {
    const geth = await startFakeGeth({ datadir: join(root, "1912") });
    const pid = geth.pid ?? -1;
    const exited = exitSignal(geth);
    geth.kill("SIGKILL");
    await exited;
    writeGethPidFile(root, pid);

    await stopOrphanedGeth(root, SHORT_GRACE_MS);

    expect(existsSync(join(root, "geth.pid"))).toBe(false);
  });

  it("does nothing without a record", async () => {
    await expect(stopOrphanedGeth(root)).resolves.toBeUndefined();
  });
});
