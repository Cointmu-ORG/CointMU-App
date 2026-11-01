// Pieces for windowsShutdown.e2e.test.ts: a stand-in app store, a fake main
// process that starts geth the way the app does, so the test can make "the
// app" die without dying itself, and process lookups.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { Wallet } from "ethers";
import type { AppStore } from "../../services/appStore";

// Nothing listens there, so geth finds no peers; a valid key, or the app would
// reject it and fall back to the real bootnode.
const DEAD_BOOTNODE_PORT = 30399;
const POWERSHELL_TIMEOUT_MS = 20_000;

const execFileAsync = promisify(execFile);

/**
 * @returns A store with a dead loopback bootnode and HTTP-RPC off; geth's IPC
 *   endpoint stays on, as in the app.
 */
export function makeTestStore(): AppStore {
  const publicKey = Wallet.createRandom().signingKey.publicKey.slice(4);
  const values = new Map<string, unknown>([
    ["advanced.httpRpc", false],
    [
      "network.bootnodes",
      [`enode://${publicKey}@127.0.0.1:${DEAD_BOOTNODE_PORT}`],
    ],
  ]);
  return {
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => values.set(key, value),
  } as unknown as AppStore;
}

/** What the fake main spawns: geth, or the supervisor running it. */
export interface FakeMainLaunch {
  file: string;
  args: string[];
  isSupervised: boolean;
  /** Outside Windows: the sh watcher the app starts next to geth. */
  watcher: { file: string; args: string[]; env: NodeJS.ProcessEnv } | null;
  graceMs: number;
}

interface LaunchModule {
  gethLaunchCommand: (options: {
    binaryPath: string;
    gethArgs: string[];
    platform: NodeJS.Platform;
    graceMs: number;
  }) => { file: string; args: string[]; isSupervised: boolean };
}

/**
 * The app's own launch command when this tree has gethSupervisor.ts. Without
 * it (main), geth as a direct child, which is what main does; main's Windows
 * watcher is left out, since libuv's job kills it with the fake main anyway.
 * @param binaryPath - geth.
 * @param gethArgs - Its arguments.
 * @param graceMs - The grace period.
 * @returns How to start geth.
 */
export async function appLaunch(
  binaryPath: string,
  gethArgs: string[],
  graceMs: number,
): Promise<Omit<FakeMainLaunch, "watcher" | "graceMs">> {
  if (!existsSync(join(__dirname, "gethSupervisor.ts"))) {
    return { file: binaryPath, args: gethArgs, isSupervised: false };
  }
  const specifier = "./gethSupervisor";
  const module = (await import(/* @vite-ignore */ specifier)) as LaunchModule;
  return module.gethLaunchCommand({
    binaryPath,
    gethArgs,
    platform: process.platform,
    graceMs,
  });
}

// Plays the app's main process: spawns geth (or the supervisor) like
// spawnGethProcess, and the sh watcher outside Windows. Their output is fd 3,
// a pipe the test reads, so geth's shutdown log is still captured once this
// process is gone.
export const FAKE_MAIN = `
const { spawn } = require("node:child_process");
const plan = JSON.parse(process.argv[2]);
const child = spawn(plan.file, plan.args, {
  stdio: [plan.isSupervised ? "pipe" : "ignore", 3, 3],
  detached: plan.isSupervised,
  windowsHide: true,
  env: process.env,
});
if (plan.watcher) {
  spawn(plan.watcher.file, [...plan.watcher.args, String(child.pid), String(plan.graceMs)], {
    env: plan.watcher.env,
    stdio: ["pipe", "ignore", "ignore", 3, 3],
  });
}
process.stdout.write(String(child.pid));
setInterval(() => {}, 1000);
`;

/**
 * @param parentPid - A Windows process.
 * @returns The PIDs of its children.
 */
export async function windowsChildPids(parentPid: number): Promise<number[]> {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${parentPid}").ProcessId`,
    ],
    { timeout: POWERSHELL_TIMEOUT_MS, windowsHide: true },
  );
  return stdout.split(/\s+/).filter(Boolean).map(Number);
}

/**
 * @param pid - A process ID.
 * @returns True while the process exists.
 */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
