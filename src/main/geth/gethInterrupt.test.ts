import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { interruptGethOnWindows, interruptHelperFor } from "./gethInterrupt";

const GETH_PID = 4242;

describe("interruptHelperFor", () => {
  it("finds the helper next to geth.exe", () => {
    expect(
      interruptHelperFor(join("C:", "app", "bin", "win", "geth.exe")),
    ).toBe(join("C:", "app", "bin", "win", "geth-interrupt.exe"));
  });
});

// Stand-in helpers are sh scripts, so these run outside Windows; the real
// helper is covered by the Windows shutdown check (windowsShutdown.e2e.test.ts).
describe.skipIf(process.platform === "win32")("interruptGethOnWindows", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cointmu-interrupt-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function fakeHelper(exitCode: number): Promise<string> {
    const helper = join(dir, "geth-interrupt");
    const script = `#!/bin/sh\necho "$1" > "${dir}/pid"\nexit ${exitCode}\n`;
    await writeFile(helper, script);
    await chmod(helper, 0o755);
    return helper;
  }

  it("passes geth's PID and reports a sent interrupt", async () => {
    const helper = await fakeHelper(0);

    const isInterrupted = await interruptGethOnWindows(GETH_PID, helper);

    expect(isInterrupted).toBe(true);
    expect((await readFile(join(dir, "pid"), "utf8")).trim()).toBe(
      String(GETH_PID),
    );
  });

  it("reports failure when the helper refuses", async () => {
    const helper = await fakeHelper(4);

    expect(await interruptGethOnWindows(GETH_PID, helper)).toBe(false);
  });

  it("reports failure when the helper is missing", async () => {
    const helper = join(dir, "missing");

    expect(await interruptGethOnWindows(GETH_PID, helper)).toBe(false);
  });
});
