// Pieces for windowsShutdown.e2e.test.ts: a stand-in app store and a fake main
// process that owns a real geth and the real watcher, so the test can make
// "the app" die without dying itself.
import { Wallet } from "ethers";
import type { WatcherCommand } from "./gethWatcherProcess";
import type { AppStore } from "../services/appStore";

// Nothing listens there, so geth finds no peers; a valid key, or the app would
// reject it and fall back to the real bootnode.
const DEAD_BOOTNODE_PORT = 30399;

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

export interface FakeMainPlan {
  gethBinary: string;
  gethArgs: string[];
  watcher: WatcherCommand;
  graceMs: number;
}

// Plays the app's main process on Windows: geth gets a hidden console of its
// own (windowsHide) and pipes for its output, the watcher the same stdio as
// startGethWatcher. geth's output pipe is fd 3, read by the test, so geth's
// shutdown log is still captured once this process is gone.
export const FAKE_MAIN = `
const { spawn } = require("node:child_process");
const plan = JSON.parse(process.argv[2]);
const geth = spawn(plan.gethBinary, plan.gethArgs, {
  stdio: ["ignore", 3, 3],
  windowsHide: true,
  env: process.env,
});
const watcher = spawn(
  plan.watcher.file,
  [...plan.watcher.args, String(geth.pid), String(plan.graceMs)],
  { env: plan.watcher.env, stdio: ["pipe", "ignore", "ignore"], windowsHide: true },
);
process.stdout.write(JSON.stringify({ geth: geth.pid, watcher: watcher.pid }));
setInterval(() => {}, 1000);
`;
