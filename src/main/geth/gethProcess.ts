import { BrowserWindow } from "electron";
import { existsSync } from "fs";
import { spawn, ChildProcess } from "child_process";
import ms from "ms";
import { buildGethHttpArgs, buildGethIpcArgs } from "./gethArgs";
import { getNetworkId, resolveDataDir } from "./networkConfig";
import { findAvailableP2pPort, getAuthRpcPort, getRpcPort } from "./ports";
import { clearPendingBootnodes, prepareBootnodeArgs } from "./bootnodeWatcher";
import { getGethIpcPath } from "./ipcEndpointLifecycle";
import { resolveGethBinaryPath } from "./gethInit";
import { parseGethLogChunk } from "../utils/gethLogParser";
import { gethLog } from "../diagnostics/logging";
import { recordGethLine } from "../diagnostics/gethReporting";
import type { GethRecovery } from "../services/gethRecovery";
import type { AppStore } from "../services/appStore";

export const NODE_RESTART_DELAY_MS = ms("1s");
const GETH_RESTART_DELAY_MS = ms("2s");
const GETH_GRACEFUL_TIMEOUT_MS = ms("15s");
const DEFAULT_P2P_PORT = 30303;
const LOCALHOST_ADDR = "127.0.0.1";
const GETH_LOG_VERBOSITY = process.env.GETH_LOG_VERBOSITY || "3";

let intentionalGethShutdown = false;
let gethRestartTimer: NodeJS.Timeout | null = null;
let gethProcess: ChildProcess | null = null;
// Kept after gethProcess is cleared so recovery can confirm the exit event fired.
let lastSpawnedGeth: ChildProcess | null = null;
let nodeRecovery: GethRecovery | null = null;

/** Wires in recovery; a setter because recovery itself needs spawn/kill. */
export function attachNodeRecovery(recovery: GethRecovery): void {
  nodeRecovery = recovery;
}

/** @returns The attached recovery controller, or null before startup wires it. */
export function getNodeRecovery(): GethRecovery | null {
  return nodeRecovery;
}

/** @returns True while a spawned geth process is alive and not being killed. */
export function isGethRunning(): boolean {
  return gethProcess !== null && !gethProcess.killed;
}

/**
 * Schedules a single delayed geth respawn after an unexpected exit. Repeated
 * calls while a restart is already pending are ignored to avoid restart storms.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {void}
 */
function scheduleGethRestart(store: AppStore): void {
  if (gethRestartTimer || nodeRecovery?.isRestartSuppressed()) {
    return;
  }
  console.warn("[geth] Unexpected exit; scheduling automatic restart");
  gethRestartTimer = setTimeout(() => {
    gethRestartTimer = null;
    void spawnGethProcess(store);
  }, GETH_RESTART_DELAY_MS);
}

/**
 * Spawns the Core-geth binary as a managed child process with environment-driven
 * configuration for networking, RPC, and data storage. The bootnodes (user
 * setting, build value or fallback) are pre-resolved so a DNS outage cannot
 * fatally abort startup: unresolved ones are left out and a watcher re-attaches
 * them once DNS recovers. Unexpected exits trigger an
 * automatic restart and mining is auto-resumed when previously enabled.
 * @param {AppStore} store - The electron-store instance containing user preferences.
 * @returns {Promise<void>}
 */
export async function spawnGethProcess(store: AppStore): Promise<void> {
  const binaryPath = resolveGethBinaryPath();
  if (!existsSync(binaryPath)) {
    console.warn(
      `[geth:spawn] Warning: Geth binary not found at ${binaryPath}. Skipping node spawn.`,
    );
    return;
  }

  const isRpcEnabled = store.get("advanced.httpRpc") ?? true;
  const configuredListenPort =
    store.get("network.listenPort") || DEFAULT_P2P_PORT;
  const listenPort = await findAvailableP2pPort(configuredListenPort);
  if (listenPort !== configuredListenPort) {
    console.warn(
      `[geth:spawn] P2P port ${configuredListenPort} is in use; listening on ${listenPort}`,
    );
  }

  const args = [
    "--networkid",
    getNetworkId(),
    "--datadir",
    resolveDataDir(),
    "--port",
    String(listenPort),
    "--verbosity",
    GETH_LOG_VERBOSITY,
    "--syncmode",
    "full",
    "--authrpc.addr",
    LOCALHOST_ADDR,
    "--authrpc.port",
    String(getAuthRpcPort()),
  ];

  args.push(...buildGethIpcArgs(getGethIpcPath()));
  if (isRpcEnabled) {
    args.push(...buildGethHttpArgs(getRpcPort()));
  }

  args.push(...(await prepareBootnodeArgs(store)));

  try {
    intentionalGethShutdown = false;
    gethProcess = spawn(binaryPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });
    lastSpawnedGeth = gethProcess;

    /**
     * Broadcasts a parsed mining log object to every renderer window.
     * @param {object} log - The normalized mining log entry.
     * @returns {void}
     */
    const broadcastMiningLog = (
      log: ReturnType<typeof parseGethLogChunk>[number],
    ): void => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("mining:log-event", log);
      });
    };

    let stdoutBuffer = "";
    let stderrBuffer = "";

    /**
     * Accumulates a raw output chunk, parses only the complete lines into mining
     * log events and the recovery classifier, and retains any trailing partial
     * line so a regex match is never broken across chunk boundaries.
     * @param {string} buffer - The current residual buffer for the stream.
     * @param {Buffer} data - The newly received raw output chunk.
     * @returns {string} The updated residual buffer after parsing complete lines.
     */
    const consumeStream = (buffer: string, data: Buffer): string => {
      const combined = buffer + data.toString();
      const newlineIndex = combined.lastIndexOf("\n");
      if (newlineIndex === -1) {
        return combined;
      }
      const complete = combined.slice(0, newlineIndex);
      complete.split("\n").forEach((line) => {
        gethLog.info(line);
        recordGethLine(line);
        nodeRecovery?.handleLogLine(line);
      });
      parseGethLogChunk(complete).forEach(broadcastMiningLog);
      return combined.slice(newlineIndex + 1);
    };

    gethProcess.stdout?.on("data", (data: Buffer) => {
      stdoutBuffer = consumeStream(stdoutBuffer, data);
    });

    /**
     * Parses Geth standard error output to stream DAG generation progress and
     * mining log events to the renderer.
     * @param {Buffer} data - The raw output chunk from the Geth process.
     * @returns {void}
     */
    const handleGethStderr = (data: Buffer): void => {
      const output = data.toString();
      const dagMatch = output.match(/percentage=(\d+)/);
      if (dagMatch && dagMatch[1]) {
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send("mining:dagProgress", parseInt(dagMatch[1], 10));
        });
      }
      stderrBuffer = consumeStream(stderrBuffer, data);
    };

    gethProcess.stderr?.on("data", handleGethStderr);

    gethProcess.on("error", (err: Error) => {
      console.error(
        `[geth:error] Failed to start geth process: ${err.message}`,
      );
      gethProcess = null;
      if (intentionalGethShutdown) {
        intentionalGethShutdown = false;
        return;
      }
      scheduleGethRestart(store);
    });

    gethProcess.on("close", (code: number | null) => {
      console.log(`[geth:close] Process exited with code ${code}`);
      gethProcess = null;
      if (intentionalGethShutdown) {
        intentionalGethShutdown = false;
        return;
      }
      nodeRecovery?.handleUnexpectedExit();
      scheduleGethRestart(store);
    });
  } catch (err) {
    console.error(
      `[geth:spawn] Unable to spawn geth binary at path: ${binaryPath}`,
    );
    gethProcess = null;
  }
}

/**
 * Sends SIGINT to the geth child process and returns a promise that resolves
 * once the process has fully terminated. A hard SIGKILL is dispatched if the
 * process does not exit within GETH_GRACEFUL_TIMEOUT_MS. When no geth process
 * is running the returned promise resolves immediately.
 * @returns {Promise<void>} Resolves after the geth process has exited.
 */
export function killGethProcess(): Promise<void> {
  intentionalGethShutdown = true;
  if (gethRestartTimer) {
    clearTimeout(gethRestartTimer);
    gethRestartTimer = null;
  }
  clearPendingBootnodes();

  if (!gethProcess) {
    return Promise.resolve();
  }

  const proc = gethProcess;
  gethProcess = null;

  return new Promise<void>((resolve) => {
    let settled = false;

    const onExit = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve();
    };

    const killTimer = setTimeout(() => {
      if (settled) return;
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, GETH_GRACEFUL_TIMEOUT_MS);

    proc.once("close", onExit);
    proc.once("exit", onExit);

    try {
      proc.kill("SIGINT");
    } catch {
      onExit();
    }
  });
}

/**
 * Reports whether the most recently spawned geth has emitted its exit event (or
 * never started). Recovery relies on this before touching chaindata on disk.
 * @returns {boolean} True when no geth process can still hold the database.
 */
export function hasGethExited(): boolean {
  const proc = lastSpawnedGeth;
  return (
    !proc ||
    proc.pid === undefined ||
    proc.exitCode !== null ||
    proc.signalCode !== null
  );
}
