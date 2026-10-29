// Windows shutdown check with the real bundled geth (#97). Stops geth through
// every path the app uses and proves each stop was clean: geth logs "Got
// interrupt, shutting down" and its next start reports no "Unclean shutdown
// detected". Each scenario runs on a fresh test chain (chain id 19129 + n,
// dead loopback bootnode, no mining), because geth repeats every recorded
// unclean shutdown on each later start.
//
// Runs only with GETH_SHUTDOWN_E2E=1: the windows-geth-check workflow, or
// locally (Linux too) inside a network namespace. It imports nothing that main
// lacks, so the same file can run against main. EXPECT_SHUTDOWN=unclean
// inverts the verdict, for a build whose stops are all TerminateProcess. GETH_SHUTDOWN_EVIDENCE_DIR
// receives every scenario's geth log and results.json.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sink = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: joinPath } = await import("node:path");
  return {
    root: mkdtempSync(joinPath(tmpdir(), "cointmu-shutdown-")),
    lines: [] as string[],
  };
});

// The real module downloads the Electron binary on first require (#74).
vi.mock("electron", () => ({
  app: {
    getPath: () => sink.root,
    getAppPath: () => process.cwd(),
    isPackaged: false,
  },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock("../diagnostics/logging", () => ({
  gethLog: { info: (line: string) => sink.lines.push(line) },
}));
vi.mock("../diagnostics/gethReporting", () => ({
  recordGethLine: () => {},
  reportBootnodeConfigProblem: () => {},
  reportBootnodeSource: () => {},
}));

import { makeWatcherDir } from "./gethWatcher.fixtures";
import { initGethIfNeeded, resolveGethBinaryPath } from "./gethInit";
import { killGethProcess, spawnGethProcess } from "./gethProcess";
import { watcherCommand } from "./gethWatcherProcess";
import { getGethIpcPath, prepareGethIpcEndpoint } from "./ipcEndpointLifecycle";
import {
  loadNetworkId,
  resolveDataDir,
  resolveDataRoot,
} from "./networkConfig";
import { restartNodeByUser } from "./nodeRestart";
import {
  GETH_GRACEFUL_TIMEOUT_MS,
  stopOrphanedGeth,
  writeGethPidFile,
} from "./orphanedGeth";
import { findAvailableP2pPort, getAuthRpcPort, getRpcPort } from "./ports";
import {
  FAKE_MAIN,
  makeTestStore,
  type FakeMainPlan,
} from "./windowsShutdown.fixtures";
import { callGethRpc } from "../utils/rpcUtils";

const IS_ENABLED = process.env.GETH_SHUTDOWN_E2E === "1";
const EXPECT_CLEAN = process.env.EXPECT_SHUTDOWN !== "unclean";
const EVIDENCE_DIR =
  process.env.GETH_SHUTDOWN_EVIDENCE_DIR || join(sink.root, "evidence");
const TEST_CHAIN_BASE = 19129;
const READY_LINE = "Started P2P networking";
const INTERRUPT_LINE = "Got interrupt, shutting down";
const UNCLEAN_LINE = "Unclean shutdown detected";
const READY_TIMEOUT_MS = 90_000;
const SCENARIO_TIMEOUT_MS = 240_000;
const POLL_MS = 200;
const DEFAULT_P2P_PORT = 30303;

interface Verdict {
  scenario: string;
  interrupted: boolean;
  uncleanOnNextStart: number;
  stopMs: number;
}

const store = makeTestStore();
const verdicts: Verdict[] = [];
const fakeMains: ChildProcess[] = [];
let chainIndex = 0;

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(
  condition: () => boolean,
  what: string,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out: ${what}`);
    await sleep(POLL_MS);
  }
}

function linesSince(from: number, text: string): number {
  return sink.lines.slice(from).filter((line) => line.includes(text)).length;
}

async function waitForLine(from: number, text: string): Promise<void> {
  await waitUntil(() => linesSince(from, text) > 0, `"${text}"`);
}

/** geth is up with its IPC endpoint and, as required, has no peers. */
async function expectReadyAndIsolated(from: number): Promise<void> {
  await waitForLine(from, READY_LINE);
  const peers = await callGethRpc(getRpcPort(), "admin_peers");
  expect(peers).toEqual([]);
}

async function useFreshChain(): Promise<void> {
  process.env.GETH_NETWORK_ID = String(TEST_CHAIN_BASE + chainIndex++);
  loadNetworkId();
  await initGethIfNeeded(resolveDataDir());
}

/** Starts geth the app's way and returns where its log begins. */
async function startNode(): Promise<number> {
  const from = sink.lines.length;
  await spawnGethProcess(store);
  await expectReadyAndIsolated(from);
  return from;
}

/** The next start on the same chain: counts the unclean shutdowns it reports. */
async function countUncleanOnNextStart(): Promise<number> {
  const from = await startNode();
  const unclean = linesSince(from, UNCLEAN_LINE);
  await killGethProcess();
  return unclean;
}

async function record(
  scenario: string,
  stopFrom: number,
  stopMs: number,
): Promise<void> {
  const interrupted = linesSince(stopFrom, INTERRUPT_LINE) > 0;
  const verdict = {
    scenario,
    interrupted,
    uncleanOnNextStart: await countUncleanOnNextStart(),
    stopMs,
  };
  verdicts.push(verdict);
  await writeFile(
    join(EVIDENCE_DIR, `geth-${scenario}.log`),
    sink.lines.join("\n"),
  );
  sink.lines.length = 0;
  if (EXPECT_CLEAN) {
    expect(verdict).toMatchObject({ interrupted: true, uncleanOnNextStart: 0 });
  } else {
    expect(verdict.uncleanOnNextStart).toBeGreaterThan(0);
  }
}

/** Starts a fake main process owning geth and the watcher (see fixtures). */
async function startFakeMain(isDetached: boolean): Promise<{
  main: ChildProcess;
  geth: number;
  watcher: number;
  from: number;
}> {
  const gethBinary = resolveGethBinaryPath();
  const ipcPath = getGethIpcPath();
  if (ipcPath === null) throw new Error("no IPC endpoint");
  // The same flags spawnGethProcess passes (HTTP-RPC off).
  const plan: FakeMainPlan = {
    gethBinary,
    gethArgs: [
      ...["--networkid", String(process.env.GETH_NETWORK_ID)],
      ...["--datadir", resolveDataDir()],
      ...["--port", String(await findAvailableP2pPort(DEFAULT_P2P_PORT))],
      ...["--verbosity", "3", "--syncmode", "full"],
      ...["--authrpc.addr", "127.0.0.1"],
      ...["--authrpc.port", String(getAuthRpcPort())],
      ...["--ipcpath", ipcPath],
      ...["--bootnodes", (store.get("network.bootnodes") as string[])[0]],
    ],
    watcher: watcherCommand(
      process.platform,
      await makeWatcherDir(),
      gethBinary,
    ),
    graceMs: GETH_GRACEFUL_TIMEOUT_MS,
  };
  const dir = join(sink.root, "fake-main");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "fake-main.js"), FAKE_MAIN);
  const from = sink.lines.length;
  const main = spawn(
    process.execPath,
    [join(dir, "fake-main.js"), JSON.stringify(plan)],
    { stdio: ["ignore", "pipe", "ignore", "pipe"], detached: isDetached },
  );
  fakeMains.push(main);
  let pending = "";
  main.stdio[3]?.on("data", (data: Buffer) => {
    const parts = (pending + data.toString()).split("\n");
    pending = parts.pop() ?? "";
    sink.lines.push(...parts);
  });
  const pids = JSON.parse(
    String(await new Promise((resolve) => main.stdout?.once("data", resolve))),
  ) as { geth: number; watcher: number };
  await expectReadyAndIsolated(from);
  return { main, ...pids, from };
}

async function timeUntilGone(pid: number, startedAt: number): Promise<number> {
  await waitUntil(() => !isAlive(pid), `geth ${pid} to exit`);
  return Date.now() - startedAt;
}

describe.runIf(IS_ENABLED)("geth shutdown on Windows", () => {
  beforeAll(async () => {
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await prepareGethIpcEndpoint(store);
  });

  afterAll(async () => {
    await killGethProcess();
    fakeMains.forEach((main) => main.kill());
    await writeFile(
      join(EVIDENCE_DIR, "results.json"),
      JSON.stringify({ expectClean: EXPECT_CLEAN, verdicts }, null, 2),
    );
    console.table(verdicts);
  });

  it(
    "S1 killGethProcess (quit, recovery, settings restart)",
    async () => {
      await useFreshChain();
      await startNode();
      const stopFrom = sink.lines.length;
      const startedAt = Date.now();

      await killGethProcess();

      await record("S1-kill", stopFrom, Date.now() - startedAt);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    "S2 restartNodeByUser",
    async () => {
      await useFreshChain();
      await startNode();
      const stopFrom = sink.lines.length;

      restartNodeByUser(store);
      await waitForLine(stopFrom, READY_LINE);
      const unclean = linesSince(stopFrom, UNCLEAN_LINE);
      await killGethProcess();
      const interrupted = linesSince(stopFrom, INTERRUPT_LINE) > 0;

      verdicts.push({
        scenario: "S2-restart",
        interrupted,
        uncleanOnNextStart: unclean,
        stopMs: -1,
      });
      await writeFile(
        join(EVIDENCE_DIR, "geth-S2-restart.log"),
        sink.lines.join("\n"),
      );
      sink.lines.length = 0;
      if (EXPECT_CLEAN) {
        expect({ interrupted, unclean }).toEqual({
          interrupted: true,
          unclean: 0,
        });
      } else {
        expect(unclean).toBeGreaterThan(0);
      }
    },
    SCENARIO_TIMEOUT_MS,
  );

  it.each([
    ["S3-watcher", false],
    ["S3b-watcher-no-console", true],
  ])(
    "%s: the watcher stops geth when the main process dies",
    async (scenario, isDetached) => {
      await useFreshChain();
      const { main, geth } = await startFakeMain(isDetached);
      const stopFrom = sink.lines.length;
      const startedAt = Date.now();

      main.kill();

      await record(scenario, stopFrom, await timeUntilGone(geth, startedAt));
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    "S4 stopOrphanedGeth at the next app start",
    async () => {
      await useFreshChain();
      const { main, geth, watcher } = await startFakeMain(false);
      process.kill(watcher);
      main.kill();
      await sleep(POLL_MS);
      expect(isAlive(geth)).toBe(true);
      writeGethPidFile(resolveDataRoot(), geth);
      const stopFrom = sink.lines.length;
      const startedAt = Date.now();

      await stopOrphanedGeth(
        resolveDataRoot(),
        GETH_GRACEFUL_TIMEOUT_MS,
        // Written out rather than imported: main has no gethInterrupt.ts.
        join(dirname(resolveGethBinaryPath()), "geth-interrupt.exe"),
      );

      await record("S4-orphan", stopFrom, await timeUntilGone(geth, startedAt));
    },
    SCENARIO_TIMEOUT_MS,
  );
});
