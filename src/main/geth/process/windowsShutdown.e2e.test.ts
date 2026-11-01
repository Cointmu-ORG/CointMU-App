// Windows shutdown check with the real bundled geth (#97). Stops geth through
// every path the app uses, and ends "the app" the ways it can die, then proves
// each stop was clean: geth logs "Got interrupt, shutting down" and its next
// start reports no "Unclean shutdown detected". Each scenario runs on a fresh
// test chain (chain id 19129 + n, dead loopback bootnode, no mining), because
// geth repeats every recorded unclean shutdown on each later start.
//
// Runs only with GETH_SHUTDOWN_E2E=1: the windows-geth-check workflow, or
// locally (Linux too) inside a network namespace. It imports nothing that main
// lacks (see appLaunch), so the same file runs against main, where
// EXPECT_SHUTDOWN=unclean inverts the verdict. GETH_SHUTDOWN_EVIDENCE_DIR
// receives every scenario's geth log and results.json.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
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
vi.mock("../../explorerIndex/explorerIndexService", () => ({
  startExplorerIndex: () => {},
  stopExplorerIndex: async () => {},
  requestIndexRebuild: () => {},
}));
vi.mock("../../diagnostics/logging", () => ({
  gethLog: { info: (line: string) => sink.lines.push(line) },
}));
vi.mock("../../diagnostics/gethReporting", () => ({
  recordGethLine: () => {},
  reportBootnodeConfigProblem: () => {},
  reportBootnodeSource: () => {},
}));

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
  appLaunch,
  isAlive,
  makeTestStore,
  windowsChildPids,
  type FakeMainLaunch,
} from "./windowsShutdown.fixtures";
import { callGethRpc } from "../rpc/rpcUtils";

const IS_ENABLED = process.env.GETH_SHUTDOWN_E2E === "1";
const IS_WINDOWS = process.platform === "win32";
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
// Written out rather than imported: main has no gethSupervisor.ts.
const SUPERVISOR = join(
  dirname(resolveGethBinaryPath()),
  "geth-supervisor.exe",
);

const execFileAsync = promisify(execFile);

interface Verdict {
  scenario: string;
  interrupted: boolean;
  uncleanOnNextStart: number;
  stopMs: number;
  isMeasuredOnly: boolean;
}

interface FakeMain {
  main: ChildProcess;
  /** geth, or on Windows the supervisor running it. */
  childPid: number;
  gethPid: number;
}

type MainKiller = (main: ChildProcess) => Promise<void>;

const store = makeTestStore();
const verdicts: Verdict[] = [];
const fakeMains: ChildProcess[] = [];
let chainIndex = 0;

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
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

async function startFreshChain(): Promise<void> {
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

async function collect(
  scenario: string,
  stopFrom: number,
  stopMs: number,
): Promise<Verdict> {
  const interrupted = linesSince(stopFrom, INTERRUPT_LINE) > 0;
  const nextFrom = await startNode();
  const verdict = {
    scenario,
    interrupted,
    uncleanOnNextStart: linesSince(nextFrom, UNCLEAN_LINE),
    stopMs,
    isMeasuredOnly: false,
  };
  await killGethProcess();
  await writeFile(
    join(EVIDENCE_DIR, `geth-${scenario}.log`),
    sink.lines.join("\n"),
  );
  sink.lines.length = 0;
  verdicts.push(verdict);
  return verdict;
}

function expectVerdict(verdict: Verdict): void {
  if (EXPECT_CLEAN) {
    expect(verdict).toMatchObject({ interrupted: true, uncleanOnNextStart: 0 });
  } else {
    expect(verdict.uncleanOnNextStart).toBeGreaterThan(0);
  }
}

function captureOutput(stream: NodeJS.ReadableStream | null): void {
  let pending = "";
  stream?.on("data", (data: Buffer) => {
    const parts = (pending + data.toString()).split("\n");
    pending = parts.pop() ?? "";
    sink.lines.push(...parts);
  });
}

/** The flags spawnGethProcess passes (HTTP-RPC off). */
async function gethArgs(): Promise<string[]> {
  const ipcPath = getGethIpcPath();
  if (ipcPath === null) throw new Error("no IPC endpoint");
  const bootnodes = store.get("network.bootnodes") as string[];
  return [
    "--networkid",
    String(process.env.GETH_NETWORK_ID),
    "--datadir",
    resolveDataDir(),
    "--port",
    String(await findAvailableP2pPort(DEFAULT_P2P_PORT)),
    "--verbosity",
    "3",
    "--syncmode",
    "full",
    "--authrpc.addr",
    "127.0.0.1",
    "--authrpc.port",
    String(getAuthRpcPort()),
    "--ipcpath",
    ipcPath,
    "--bootnodes",
    bootnodes[0],
  ];
}

/** Starts a fake main process that starts geth like the app (see fixtures). */
async function startFakeMain(isDetached: boolean): Promise<FakeMain> {
  const launch = await appLaunch(
    resolveGethBinaryPath(),
    await gethArgs(),
    GETH_GRACEFUL_TIMEOUT_MS,
  );
  const plan: FakeMainLaunch = {
    ...launch,
    watcher: IS_WINDOWS ? null : watcherCommand(),
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
  captureOutput(main.stdio[3] as NodeJS.ReadableStream | null);
  const childPid = Number(
    await new Promise((resolve) => main.stdout?.once("data", resolve)),
  );
  await expectReadyAndIsolated(from);
  const gethPid = launch.isSupervised
    ? (await windowsChildPids(childPid))[0]
    : childPid;
  return { main, childPid, gethPid };
}

async function timeUntilGone(pid: number, startedAt: number): Promise<number> {
  await waitUntil(() => !isAlive(pid), `geth ${pid} to exit`);
  return Date.now() - startedAt;
}

const terminate: MainKiller = async (main) => {
  main.kill();
};

const taskkill =
  (flags: string[]): MainKiller =>
  async (main) => {
    await execFileAsync("taskkill", [...flags, "/PID", String(main.pid)]);
  };

/** The main process dies (killer); returns the verdict on how geth ended. */
async function killFakeMain(
  scenario: string,
  isDetached: boolean,
  kill: MainKiller,
): Promise<Verdict> {
  await startFreshChain();
  const { main, gethPid } = await startFakeMain(isDetached);
  const stopFrom = sink.lines.length;
  const startedAt = Date.now();

  await kill(main);

  const stopMs = await timeUntilGone(gethPid, startedAt);
  return collect(scenario, stopFrom, stopMs);
}

describe.runIf(IS_ENABLED)("geth shutdown", () => {
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
    "S1 killGethProcess (quit, recovery, settings restart, update)",
    async () => {
      await startFreshChain();
      await startNode();
      const stopFrom = sink.lines.length;
      const startedAt = Date.now();

      await killGethProcess();

      expectVerdict(await collect("S1-kill", stopFrom, Date.now() - startedAt));
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    "S2 restartNodeByUser",
    async () => {
      await startFreshChain();
      await startNode();
      const stopFrom = sink.lines.length;

      restartNodeByUser(store);
      await waitForLine(stopFrom, READY_LINE);

      const verdict = {
        scenario: "S2-restart",
        interrupted: linesSince(stopFrom, INTERRUPT_LINE) > 0,
        uncleanOnNextStart: linesSince(stopFrom, UNCLEAN_LINE),
        stopMs: -1,
        isMeasuredOnly: false,
      };
      await killGethProcess();
      await writeFile(
        join(EVIDENCE_DIR, "geth-S2-restart.log"),
        sink.lines.join("\n"),
      );
      sink.lines.length = 0;
      verdicts.push(verdict);
      expectVerdict(verdict);
    },
    SCENARIO_TIMEOUT_MS,
  );

  it.each([
    ["S3-main-terminated", false],
    ["S3b-main-terminated-no-console", true],
  ])(
    "%s: geth stops cleanly when the main process dies",
    async (scenario, isDetached) => {
      expectVerdict(await killFakeMain(scenario, isDetached, terminate));
    },
    SCENARIO_TIMEOUT_MS,
  );

  it.runIf(IS_WINDOWS)(
    "S5 taskkill /F on the main process (End Task on it)",
    async () => {
      const verdict = await killFakeMain(
        "S5-taskkill",
        false,
        taskkill(["/F"]),
      );
      expectVerdict(verdict);
    },
    SCENARIO_TIMEOUT_MS,
  );

  // Kills geth itself, which nothing can make clean; recorded, not asserted.
  it.runIf(IS_WINDOWS)(
    "S6 taskkill /T /F on the main process tree (measured only)",
    async () => {
      const verdict = await killFakeMain(
        "S6-taskkill-tree",
        false,
        taskkill(["/T", "/F"]),
      );
      verdict.isMeasuredOnly = true;
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    "S4a stopOrphanedGeth on a PID file naming the supervisor",
    async () => {
      await startFreshChain();
      const { main, childPid, gethPid } = await startFakeMain(false);
      main.kill();
      writeGethPidFile(resolveDataRoot(), childPid);
      const stopFrom = sink.lines.length;
      const startedAt = Date.now();

      await stopOrphanedGeth(
        resolveDataRoot(),
        GETH_GRACEFUL_TIMEOUT_MS,
        SUPERVISOR,
      );

      const stopMs = await timeUntilGone(gethPid, startedAt);
      expectVerdict(await collect("S4a-orphan-supervisor", stopFrom, stopMs));
    },
    SCENARIO_TIMEOUT_MS,
  );

  it(
    "S4b stopOrphanedGeth on a PID file naming geth (no supervisor)",
    async () => {
      await startFreshChain();
      const from = sink.lines.length;
      const geth = spawn(resolveGethBinaryPath(), await gethArgs(), {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      captureOutput(geth.stdout);
      captureOutput(geth.stderr);
      await expectReadyAndIsolated(from);
      if (geth.pid === undefined) throw new Error("geth did not start");
      writeGethPidFile(resolveDataRoot(), geth.pid);
      const stopFrom = sink.lines.length;
      const startedAt = Date.now();

      await stopOrphanedGeth(
        resolveDataRoot(),
        GETH_GRACEFUL_TIMEOUT_MS,
        SUPERVISOR,
      );

      const stopMs = await timeUntilGone(geth.pid, startedAt);
      expectVerdict(await collect("S4b-orphan-geth", stopFrom, stopMs));
    },
    SCENARIO_TIMEOUT_MS,
  );
});
