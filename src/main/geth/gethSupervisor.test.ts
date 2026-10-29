import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  gethLaunchCommand,
  interruptGethOnWindows,
  supervisorFor,
} from "./gethSupervisor";

const GETH_PID = 4242;
const GRACE_MS = 15_000;
const BIN = join("C:", "app", "bin", "win");
const GETH = join(BIN, "geth.exe");
const GETH_ARGS = ["--networkid", "1912", "--datadir", "C:\\a b\\1912"];

describe("gethLaunchCommand", () => {
  it("runs geth under the supervisor on Windows", () => {
    const launch = gethLaunchCommand({
      binaryPath: GETH,
      gethArgs: GETH_ARGS,
      platform: "win32",
      graceMs: GRACE_MS,
      hasFile: (path) => path === supervisorFor(GETH),
    });

    expect(launch).toEqual({
      file: join(BIN, "geth-supervisor.exe"),
      args: ["run", "--grace-ms", "15000", "--", GETH, ...GETH_ARGS],
      isSupervised: true,
    });
  });

  it("runs geth itself when the supervisor is missing", () => {
    const launch = gethLaunchCommand({
      binaryPath: GETH,
      gethArgs: GETH_ARGS,
      platform: "win32",
      graceMs: GRACE_MS,
      hasFile: () => false,
    });

    expect(launch).toEqual({
      file: GETH,
      args: GETH_ARGS,
      isSupervised: false,
    });
  });

  it.each(["linux", "darwin"] as const)(
    "runs geth itself on %s",
    (platform) => {
      const launch = gethLaunchCommand({
        binaryPath: "/app/bin/geth",
        gethArgs: GETH_ARGS,
        platform,
        graceMs: GRACE_MS,
        hasFile: () => true,
      });

      expect(launch.isSupervised).toBe(false);
      expect(launch.file).toBe("/app/bin/geth");
    },
  );
});

// Stand-in supervisors are sh scripts, so these run outside Windows; the real
// one is covered by the Windows shutdown check (windowsShutdown.e2e.test.ts).
describe.skipIf(process.platform === "win32")("interruptGethOnWindows", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cointmu-supervisor-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function fakeSupervisor(exitCode: number): Promise<string> {
    const supervisor = join(dir, "geth-supervisor");
    const script = `#!/bin/sh\necho "$@" > "${dir}/args"\nexit ${exitCode}\n`;
    await writeFile(supervisor, script);
    await chmod(supervisor, 0o755);
    return supervisor;
  }

  it("runs `interrupt <pid>` and reports a sent interrupt", async () => {
    const supervisor = await fakeSupervisor(0);

    const isInterrupted = await interruptGethOnWindows(GETH_PID, supervisor);

    expect(isInterrupted).toBe(true);
    expect((await readFile(join(dir, "args"), "utf8")).trim()).toBe(
      `interrupt ${GETH_PID}`,
    );
  });

  it("reports failure when the supervisor refuses", async () => {
    const supervisor = await fakeSupervisor(4);

    expect(await interruptGethOnWindows(GETH_PID, supervisor)).toBe(false);
  });

  it("reports failure when the supervisor is missing", async () => {
    expect(await interruptGethOnWindows(GETH_PID, join(dir, "missing"))).toBe(
      false,
    );
  });
});
