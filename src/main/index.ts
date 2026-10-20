import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  powerMonitor,
  dialog,
} from "electron";
import { join } from "path";
import { existsSync, writeFileSync } from "fs";
import {
  readdir,
  stat,
  readFile,
  writeFile,
  rm,
  mkdir,
  copyFile,
} from "fs/promises";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { spawn, ChildProcess } from "child_process";
import { lookup } from "node:dns/promises";
import { config } from "dotenv";
import detectPort from "detect-port";
import { registerCryptoHandlers } from "./services/crypto";
import { registerSystemHandlers } from "./services/system";
import { initUpdater } from "./services/updater";
import { parseGethLogChunk } from "./utils/gethLogParser";
import { GENESIS_BLOCK, type GenesisBlock } from "./services/genesis";
import ms from "ms";
import { callGethRpc, configureGethIpcPath } from "./utils/rpcUtils";
import { buildGethHttpArgs, buildGethIpcArgs } from "./geth/gethArgs";
import {
  formatEnode,
  parseEnode,
  resolveBootnodeConfig,
} from "./geth/bootnode";
import {
  getOrCreateInstallId,
  resolveGethIpcEndpoint,
  type GethIpcEndpoint,
} from "./geth/ipcEndpoint";
import { registerRendererRpcHandler } from "./services/rendererRpc";
import { GethRecovery } from "./services/gethRecovery";
import { NODE_CHANNELS } from "../bridge/ipc-channels";
import {
  scanWalletActivity,
  fetchNetworkInsights,
} from "./services/activityScanner";
import {
  startExtensionSyncServer,
  broadcastWalletState,
} from "./services/extensionSyncServer";
import { gethLog, initLogging } from "./diagnostics/logging";
import { initErrorReporting } from "./diagnostics/errorReporting";
import {
  recordGethLine,
  reportBootnodeConfigProblem,
  reportRecoveryEvent,
} from "./diagnostics/gethReporting";
import { registerDiagnosticsHandlers } from "./diagnostics/diagnosticsIpc";

initLogging();
initErrorReporting();

config({ path: join(app.getAppPath(), ".env") });

const SESSION_DURATION_MS = ms("7d");
const NODE_RESTART_DELAY_MS = ms("1s");
const GETH_RESTART_DELAY_MS = ms("2s");
const BOOTNODE_DNS_RETRY_MS = ms("30s");

const GETH_GRACEFUL_TIMEOUT_MS = ms("15s");

const MAX_PORT_SCAN_ATTEMPTS = 50;

const WINDOW_DEFAULT_WIDTH = 1280;
const WINDOW_DEFAULT_HEIGHT = 800;
const WINDOW_MIN_WIDTH = 900;
const WINDOW_MIN_HEIGHT = 600;

const DEFAULT_RPC_PORT = parseInt(process.env.GETH_HTTP_PORT || "8585", 10);
// Geth always opens the engine (auth) RPC; its fixed default 8551 collides
// with any other node on the machine, so it is scanned like the HTTP port.
const DEFAULT_AUTH_RPC_PORT = 8551;
const DEFAULT_P2P_PORT = 30303;
const LOCALHOST_ADDR = "127.0.0.1";
let GETH_NETWORK_ID =
  process.env.GETH_NETWORK_ID || String(GENESIS_BLOCK.config.chainId);

/**
 * Resolves the active chain id and records it as the authoritative network id
 * used for both genesis init and the geth spawn. Resolution order is: a persisted
 * override (set by the chain-id editor), then the GETH_NETWORK_ID environment
 * value, then the inlined genesis default.
 * @param {any} store - The electron-store instance holding the optional override.
 * @returns {void}
 */
function loadNetworkId(store: any): void {
  const override = Number(store.get("network.chainId"));
  const envNetworkId = Number(process.env.GETH_NETWORK_ID);
  GETH_NETWORK_ID = String(
    Number.isFinite(override) && override > 0
      ? override
      : Number.isFinite(envNetworkId) && envNetworkId > 0
        ? envNetworkId
        : GENESIS_BLOCK.config.chainId,
  );
}

/**
 * Builds the effective genesis block by applying the active chain id override to
 * the inlined canonical genesis constant.
 * @returns {GenesisBlock} The genesis block to initialize the chain with.
 */
function buildGenesis(): GenesisBlock {
  return {
    ...GENESIS_BLOCK,
    config: { ...GENESIS_BLOCK.config, chainId: Number(GETH_NETWORK_ID) },
  };
}
const GETH_DATA_DIR = join(app.getPath("userData"), "cointmu-chaindata");
// Baked in at build time; a packaged app never sees the CI process.env.
const BOOTNODE_CONFIG = resolveBootnodeConfig(
  import.meta.env.MAIN_VITE_BOOTNODE_ENODE,
);
if (BOOTNODE_CONFIG.problem) {
  console.warn(
    `[bootnode] MAIN_VITE_BOOTNODE_ENODE is not a valid enode (${BOOTNODE_CONFIG.problem}); expected enode://<128 hex>@<host>:<port>. Using the built-in bootnode.`,
  );
  reportBootnodeConfigProblem(BOOTNODE_CONFIG.problem);
}
console.log(`[bootnode] Using the ${BOOTNODE_CONFIG.source} bootnode`);

let intentionalGethShutdown = false;
let isAppQuitting = false;
let gethRestartTimer: NodeJS.Timeout | null = null;
let bootnodeWatcher: NodeJS.Timeout | null = null;
let pendingBootnodeEnode: string | null = null;

/**
 * Resolves the absolute geth data directory for the active network:
 * <userData>/cointmu-chaindata/<networkId>.
 * @returns {string} The absolute data directory path.
 */
function resolveDataDir(): string {
  return join(GETH_DATA_DIR, GETH_NETWORK_ID);
}

/**
 * Recursively sums the byte size of every file under a directory. Returns 0 when
 * the directory is missing or unreadable so callers can render a safe default.
 * @param {string} dir - The directory to measure.
 * @returns {Promise<number>} The total size in bytes.
 */
async function getDirectorySize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySize(entryPath);
      } else if (entry.isFile()) {
        try {
          total += (await stat(entryPath)).size;
        } catch {
          total += 0;
        }
      }
    }
  } catch {
    return 0;
  }
  return total;
}
const GETH_LOG_VERBOSITY = process.env.GETH_LOG_VERBOSITY || "3";

let resolvedRpcPort: number = DEFAULT_RPC_PORT;
let resolvedAuthRpcPort: number = DEFAULT_AUTH_RPC_PORT;
let gethProcess: ChildProcess | null = null;
// Kept after gethProcess is cleared so recovery can confirm the exit event fired.
let lastSpawnedGeth: ChildProcess | null = null;
let nodeRecovery: GethRecovery | null = null;
let sessionStartTimestamp: number = Date.now();
let gethIpcEndpoint: GethIpcEndpoint | null = null;

/**
 * Prepares the private geth IPC endpoint. On failure geth starts with IPC
 * disabled, so mining controls fail visibly instead of using an unsafe path.
 * @param {any} store - The electron-store instance holding the install id.
 * @returns {Promise<void>}
 */
async function prepareGethIpcEndpoint(store: any): Promise<void> {
  try {
    gethIpcEndpoint = await resolveGethIpcEndpoint({
      userDataDir: app.getPath("userData"),
      installId: getOrCreateInstallId(store),
    });
  } catch (err) {
    console.error("[geth:ipc] Could not prepare a private IPC endpoint:", err);
    gethIpcEndpoint = null;
  }
  configureGethIpcPath(gethIpcEndpoint?.path ?? null);
}

/**
 * Removes the short-path IPC directory created when userData was too long.
 * @returns {Promise<void>}
 */
async function removeTemporaryIpcDir(): Promise<void> {
  const dir = gethIpcEndpoint?.temporaryDir;
  if (!dir) return;
  await rm(dir, { recursive: true, force: true }).catch((err) => {
    console.warn("[geth:ipc] Failed to remove temporary IPC dir:", err);
  });
}

/**
 * Resolves the absolute path to the bundled Core-geth binary based on the
 * current operating system. Uses platform-specific subdirectories to avoid
 * bundling binaries for the wrong OS.
 * @returns {string} The absolute filesystem path to the geth executable.
 */
function resolveGethBinaryPath(): string {
  const platformDir =
    process.platform === "win32"
      ? "win"
      : process.platform === "darwin"
        ? "mac"
        : "linux";
  const binaryName = process.platform === "win32" ? "geth.exe" : "geth";
  if (app.isPackaged) {
    return join(process.resourcesPath, "bin", platformDir, binaryName);
  }
  return join(app.getAppPath(), "resources", "bin", platformDir, binaryName);
}

/**
 * Scans for the first available TCP port starting from a default.
 * Uses detect-port to avoid binding conflicts with other local services.
 * @param startPort - The preferred port and start of the scan range.
 * @param reservedPort - A port already assigned to geth but not yet bound, so detect-port cannot see it.
 * @returns A promise resolving to the first available port number, or startPort when none is free.
 */
async function findAvailablePort(
  startPort: number,
  reservedPort?: number,
): Promise<number> {
  const portRangeEnd = startPort + MAX_PORT_SCAN_ATTEMPTS;

  for (let candidate = startPort; candidate < portRangeEnd; candidate++) {
    if (candidate === reservedPort) continue;
    try {
      const available = await detectPort(candidate);
      if (available === candidate) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return startPort;
}

/**
 * Initializes the geth chain database from the inlined genesis block on a fresh
 * installation only. It detects an existing database by stat-ing the chaindata
 * directory and skips when present. On a fresh datadir it writes the effective
 * genesis to a temporary file, runs 'geth --datadir <dir> init <temp>', and
 * removes the temporary file afterward. The whole flow is invisible to the user.
 * @param {string} datadir - The absolute geth data directory.
 * @returns {Promise<void>} Resolves once the chain is initialized or already present.
 */
async function initGethIfNeeded(datadir: string): Promise<void> {
  const chainDataPath = join(datadir, "geth", "chaindata");
  try {
    await stat(chainDataPath);
    console.log(
      "[geth:init] Chain data already exists, skipping genesis initialization.",
    );
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  const binaryPath = resolveGethBinaryPath();
  if (!existsSync(binaryPath)) {
    console.warn(
      `[geth:init] Warning: Geth binary not found at ${binaryPath}. Skipping node init.`,
    );
    return;
  }

  console.log("[geth:init] Initializing chain with genesis block...");
  await mkdir(datadir, { recursive: true });
  const tempGenesisPath = join(datadir, "genesis-temp.json");
  await writeFile(
    tempGenesisPath,
    JSON.stringify(buildGenesis(), null, 2),
    "utf8",
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const initProcess = spawn(
        binaryPath,
        ["--datadir", datadir, "init", tempGenesisPath],
        {
          stdio: "ignore",
        },
      );
      initProcess.on("exit", (code) => {
        if (code === 0) {
          console.log("[geth:init] Genesis initialization successful.");
          resolve();
        } else {
          reject(new Error(`Geth init failed with code ${code}`));
        }
      });
      initProcess.on("error", reject);
    });
  } finally {
    await rm(tempGenesisPath, { force: true });
  }
}

/**
 * Resolves an enode's hostname to an IP so geth never depends on its own DNS
 * resolution. IP-based enodes are returned unchanged. Returns null when the
 * hostname cannot currently be resolved, signaling a DNS outage.
 * @param {string} enode - The configured bootnode enode URL.
 * @returns {Promise<string | null>} The IP-rewritten enode, or null on failure.
 */
async function resolveBootnodeEnode(enode: string): Promise<string | null> {
  const parsed = parseEnode(enode);
  if (!parsed) {
    return null;
  }
  if (parsed.isIp) {
    return enode;
  }
  try {
    const { address } = await lookup(parsed.host);
    return formatEnode(parsed, address);
  } catch {
    return null;
  }
}

/**
 * Stops the bootnode DNS-recovery watcher if it is running.
 * @returns {void}
 */
function stopBootnodeWatcher(): void {
  if (bootnodeWatcher) {
    clearInterval(bootnodeWatcher);
    bootnodeWatcher = null;
  }
}

/**
 * Starts a periodic watcher that re-resolves a bootnode whose DNS was down at
 * spawn time. Once the hostname resolves again, the peer is added back to the
 * running node via admin_addPeer so it resumes discovery and propagates locally
 * mined blocks without a manual restart.
 * @returns {void}
 */
function startBootnodeWatcher(): void {
  if (bootnodeWatcher) {
    return;
  }
  bootnodeWatcher = setInterval(async () => {
    if (!pendingBootnodeEnode) {
      stopBootnodeWatcher();
      return;
    }
    const resolved = await resolveBootnodeEnode(pendingBootnodeEnode);
    if (!resolved) {
      return;
    }
    const added = await callGethRpc(resolvedRpcPort, "admin_addPeer", [
      resolved,
    ]);
    if (added !== null) {
      console.log("[geth] Bootnode reachable again; re-added peer");
      pendingBootnodeEnode = null;
      stopBootnodeWatcher();
    }
  }, BOOTNODE_DNS_RETRY_MS);
}

/**
 * Schedules a single delayed geth respawn after an unexpected exit. Repeated
 * calls while a restart is already pending are ignored to avoid restart storms.
 * @param {any} store - The electron-store instance containing user preferences.
 * @returns {void}
 */
function scheduleGethRestart(store: any): void {
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
 * configuration for networking, RPC, and data storage. The configured bootnode
 * is pre-resolved so a DNS outage cannot fatally abort startup: when it cannot be
 * resolved the node launches without bootnodes in an isolated local state and a
 * watcher re-attaches the peer once DNS recovers. Unexpected exits trigger an
 * automatic restart and mining is auto-resumed when previously enabled.
 * @param {any} store - The electron-store instance containing user preferences.
 * @returns {Promise<void>}
 */
async function spawnGethProcess(store: any): Promise<void> {
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
  // detect-port probes TCP only; a UDP-only clash still ends in PORT_IN_USE.
  const listenPort = await findAvailablePort(configuredListenPort);
  if (listenPort !== configuredListenPort) {
    console.warn(
      `[geth:spawn] P2P port ${configuredListenPort} is in use; listening on ${listenPort}`,
    );
  }

  const args = [
    "--networkid",
    GETH_NETWORK_ID,
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
    String(resolvedAuthRpcPort),
  ];

  args.push(...buildGethIpcArgs(gethIpcEndpoint?.path ?? null));
  if (isRpcEnabled) {
    args.push(...buildGethHttpArgs(resolvedRpcPort));
  }

  const configuredEnode = BOOTNODE_CONFIG.enode;
  const resolvedEnode = await resolveBootnodeEnode(configuredEnode);
  if (resolvedEnode) {
    args.push("--bootnodes", resolvedEnode);
    pendingBootnodeEnode = null;
    stopBootnodeWatcher();
  } else {
    console.warn(
      "[geth:spawn] Bootnode DNS unresolved; starting without bootnodes in isolated local state",
    );
    pendingBootnodeEnode = configuredEnode;
    startBootnodeWatcher();
  }

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
function killGethProcess(): Promise<void> {
  intentionalGethShutdown = true;
  if (gethRestartTimer) {
    clearTimeout(gethRestartTimer);
    gethRestartTimer = null;
  }
  stopBootnodeWatcher();
  pendingBootnodeEnode = null;

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
function hasGethExited(): boolean {
  const proc = lastSpawnedGeth;
  return (
    !proc ||
    proc.pid === undefined ||
    proc.exitCode !== null ||
    proc.signalCode !== null
  );
}

/**
 * Validates whether the current session is within the allowed duration window.
 * @returns True if the session has not exceeded SESSION_DURATION_MS.
 */
function isSessionValid(): boolean {
  const elapsed = Date.now() - sessionStartTimestamp;
  return elapsed < SESSION_DURATION_MS;
}

/**
 * Creates the main application BrowserWindow with security-hardened settings
 * and context-isolated preload script.
 * @returns The created BrowserWindow instance.
 */
function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    title: "CointMU",
    icon:
      process.platform === "win32"
        ? join(__dirname, "../../resources/icon.ico")
        : join(__dirname, "../../resources/icon.png"),
    backgroundColor: "#0a0a0f",
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}

/**
 * Central controller for managing the underlying Geth mining process.
 * Handles RPC dispatch, power state transitions via powerMonitor, and syncing
 * with the global electron-store configuration.
 */
class MiningController {
  private rpcPort: number;
  private store: any;
  private win: BrowserWindow | null;

  constructor(rpcPort: number, store: any) {
    this.rpcPort = rpcPort;
    this.store = store;
    this.win = null;

    this.setupPowerMonitor();
    this.setupIpcHandlers();
  }

  public setWindow(win: BrowserWindow): void {
    this.win = win;
  }

  /**
   * Toggles the mining state on or off. Dispatches miner_start or miner_stop.
   * The etherbase is sourced exclusively from the persisted mining reward address
   * (mining.poolAddress) and never from the active wallet tab, so the address
   * that receives block rewards is owned solely by Mining Settings.
   * @param {boolean} enabled - Target mining state.
   * @returns {Promise<void>}
   */
  private async toggleMining(enabled: boolean): Promise<void> {
    this.store.set("mining.isMiningEnabled", enabled);
    if (enabled) {
      const rewardAddress = this.store.get("mining.poolAddress");
      if (!rewardAddress) {
        throw new Error(
          "No mining reward address configured. Set one in Mining Settings.",
        );
      }

      await callGethRpc(this.rpcPort, "miner_setEtherbase", [rewardAddress]);

      const threads = this.store.get("mining.cpuThreads") || 4;
      await callGethRpc(this.rpcPort, "miner_start", [Math.floor(threads)]);
    } else {
      await callGethRpc(this.rpcPort, "miner_stop");
    }
  }

  /**
   * Updates the allocated CPU threads. If mining is currently enabled, it gracefully
   * restarts the miner to apply the new thread count.
   * @param {number} cores - Number of CPU cores to allocate.
   * @returns {Promise<void>}
   */
  private async updateThreads(cores: number): Promise<void> {
    this.store.set("mining.cpuThreads", cores);
    const actuallyMining = await callGethRpc(this.rpcPort, "eth_mining");

    if (actuallyMining === true || actuallyMining === "true") {
      await callGethRpc(this.rpcPort, "miner_stop");
      await callGethRpc(this.rpcPort, "miner_start", [Math.floor(cores)]);
    }
  }

  /**
   * Sets the target pool address in the persistent store and dispatches
   * miner_setEtherbase to the running node.
   * @param {string} address - The 42-character hex wallet address.
   * @returns {Promise<void>}
   */
  private async setPoolAddress(address: string): Promise<void> {
    this.store.set("mining.poolAddress", address);
    await callGethRpc(this.rpcPort, "miner_setEtherbase", [address]);
  }

  private setupPowerMonitor(): void {
    powerMonitor.on("on-battery", async () => {
      const pauseOnBattery = this.store.get("mining.pauseOnBattery");
      if (pauseOnBattery) {
        console.log("[power] On battery - pausing miner");
        await callGethRpc(this.rpcPort, "miner_stop");
        if (this.win) {
          this.win.webContents.send(
            "mining:status-changed",
            "Paused (Battery)",
          );
        }
      }
    });

    powerMonitor.on("on-ac", async () => {
      const isMiningEnabled = this.store.get("mining.isMiningEnabled");
      const pauseOnBattery = this.store.get("mining.pauseOnBattery");
      if (isMiningEnabled && pauseOnBattery) {
        const threads = this.store.get("mining.cpuThreads") || 4;
        console.log("[power] On AC - resuming miner with", threads, "threads");
        await callGethRpc(this.rpcPort, "miner_start", [threads]);
        if (this.win) {
          this.win.webContents.send("mining:status-changed", "Mining");
        }
      }
    });
  }

  private setupIpcHandlers(): void {
    ipcMain.handle("mining:toggle", async (_, enabled: boolean) => {
      await this.toggleMining(enabled);
    });

    ipcMain.handle("mining:setThreads", async (_, cores: number) => {
      await this.updateThreads(cores);
    });

    ipcMain.handle("mining:setPoolAddress", async (_, address: string) => {
      await this.setPoolAddress(address);
    });

    /**
     * Retrieves the current mining status, hashrate, block difficulty, and latest block height directly from the Geth node.
     * @returns {Promise<{isMining: boolean, hashrate: number, difficulty: number, blockNumber: number}>} The current stats.
     */
    ipcMain.handle(
      "mining:getStats",
      async (): Promise<{
        isMining: boolean;
        hashrate: number;
        difficulty: number;
        blockNumber: number;
      }> => {
        try {
          const isMiningHex = await callGethRpc(this.rpcPort, "eth_mining");
          const hashrateHex = await callGethRpc(this.rpcPort, "eth_hashrate");
          const latestBlock = await callGethRpc(
            this.rpcPort,
            "eth_getBlockByNumber",
            ["latest", false],
          );
          const difficulty =
            latestBlock && latestBlock.difficulty
              ? parseInt(latestBlock.difficulty, 16)
              : 0;
          const blockNumber =
            latestBlock && latestBlock.number
              ? parseInt(latestBlock.number, 16)
              : 0;
          const hashrate =
            typeof hashrateHex === "string"
              ? parseInt(hashrateHex, 16) || 0
              : Number(hashrateHex) || 0;
          const isMining = isMiningHex === true || isMiningHex === "true";

          console.debug(
            `[mining:getStats] eth_mining=${isMiningHex} eth_hashrate raw=${hashrateHex} parsed=${hashrate} H/s`,
          );

          return { isMining, hashrate, difficulty, blockNumber };
        } catch (error) {
          return {
            isMining: false,
            hashrate: 0,
            difficulty: 0,
            blockNumber: 0,
          };
        }
      },
    );

    ipcMain.handle("wallet:getActivity", async (_, addresses: string[]) => {
      return scanWalletActivity(this.rpcPort, addresses);
    });

    /**
     * Fetches aggregated network statistics from the local Geth node.
     * @param {Electron.IpcMainInvokeEvent} _event - The IPC event object.
     * @returns {Promise<object>} The aggregated network statistics payload.
     */
    ipcMain.handle("network:getInsights", async (_event) => {
      return fetchNetworkInsights(this.rpcPort);
    });
  }
}

// A second instance would spawn a second geth on the same datadir and fail on
// the database lock, so it quits and hands focus to the running instance.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  const [win] = BrowserWindow.getAllWindows();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  electronApp.setAppUserModelId("com.cointmu.desktop");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  sessionStartTimestamp = Date.now();

  ipcMain.handle("get-rpc-port", () => resolvedRpcPort);
  ipcMain.handle("get-node-status", () => ({
    running: gethProcess !== null && !gethProcess.killed,
    port: resolvedRpcPort,
    sessionValid: isSessionValid(),
    networkId: GETH_NETWORK_ID,
  }));

  const { default: Store } = await import("electron-store");

  const store = new Store({
    defaults: {
      mnemonic: null,
      activeWalletAddress: null,
      accounts: [],
      general: {
        launchAtLogin: true,
        openInBackground: false,
        pushNotifications: true,
        notificationSound: false,
        language: "English",
        currency: "CMU (native)",
      },
      appearance: {
        theme: "Light",
        accentColor: "#3b82f6", // blue-500
        density: "Comfortable",
        showSidebarColors: true,
        animatedTransitions: true,
      },
      network: {
        network: "CointMU Mainnet",
        rpcEndpoint: "https://rpc.cointmu.net",
        maxPeers: 14,
        discovery: true,
        listenPort: 30303,
        syncMode: "Snap (recommended)",
        pruneOldState: true,
      },
      mining: {
        isMiningEnabled: false,
        startAtLaunch: false,
        cpuThreads: 4,
        intensity: "Balanced",
        pauseOnBattery: true,
        miningMode: "Solo",
        poolAddress: "",
      },
      security: {
        autoLock: true,
        requireBiometrics: false,
      },
      advanced: {
        httpRpc: true,
        wsRpc: false,
        corsOrigins: "https://*.cointmu.net",
        logLevel: "Info",
      },
      notifications: {
        global: true,
        transactions: true,
        mining: true,
        security: true,
        desktopOs: true,
        sound: false,
      },
      notificationHistory: [],
      telemetry: {
        enabled: true,
        noticeAcknowledged: false,
      },
    },
  });

  registerDiagnosticsHandlers(store);

  ipcMain.handle("settings:get", (_, key) => store.get(key));
  ipcMain.handle("settings:set", (_, key, value) => {
    store.set(key, value);
    if (key === "activeWalletAddress" || key === "network.network") {
      void broadcastWalletState(store, resolvedRpcPort);
    }
  });
  ipcMain.handle("settings:getAll", () => store.store);

  ipcMain.handle(
    "dialog:saveKeystore",
    async (_, keystoreJson: string, filename: string) => {
      const result = await dialog.showSaveDialog({
        title: "Export Keystore",
        defaultPath: filename,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      try {
        writeFileSync(result.filePath, keystoreJson, "utf8");
        return { success: true, path: result.filePath };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
  );

  ipcMain.handle("export-extension-zip", async () => {
    const sourcePath = app.isPackaged
      ? join(process.resourcesPath, "extension.zip")
      : join(app.getAppPath(), "resources", "extension.zip");

    if (!existsSync(sourcePath)) {
      console.error("[export] Extension ZIP not found at:", sourcePath);
      return false;
    }

    const result = await dialog.showSaveDialog({
      title: "Export Companion Browser Extension",
      defaultPath: "CointMU-Extension.zip",
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    });

    if (result.canceled || !result.filePath) {
      return false;
    }

    try {
      await copyFile(sourcePath, result.filePath);
      return true;
    } catch (err) {
      console.error("[export] Failed to copy extension ZIP:", err);
      return false;
    }
  });

  ipcMain.handle("wallet:clearAllData", () => {
    try {
      store.set("encryptedPayload", null);
      store.set("mnemonic", null);
      store.set("activeWalletAddress", null);
      store.set("accounts", []);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle("app:getDatadir", () => resolveDataDir());

  ipcMain.handle("app:getChainDbSize", async () => {
    try {
      return await getDirectorySize(
        join(resolveDataDir(), "geth", "chaindata"),
      );
    } catch {
      return 0;
    }
  });

  ipcMain.handle("app:openDataFolder", () => shell.openPath(resolveDataDir()));

  ipcMain.handle("app:openKeystore", async () => {
    const result = await dialog.showOpenDialog({
      title: "Import Keystore",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    try {
      const data = await readFile(result.filePaths[0], "utf8");
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  registerCryptoHandlers();
  registerSystemHandlers();

  ipcMain.handle("network:getGenesisConfig", () => {
    return buildGenesis();
  });

  ipcMain.handle("network:setChainId", async (_, newId: number) => {
    try {
      GETH_NETWORK_ID = String(newId);
      store.set("network.chainId", newId);

      await killGethProcess();

      const dataDir = resolveDataDir();

      setTimeout(async () => {
        try {
          await initGethIfNeeded(dataDir);
        } catch (err) {
          console.error(
            "[network:setChainId] Genesis re-initialization failed",
            err,
          );
        }
        void spawnGethProcess(store);
      }, NODE_RESTART_DELAY_MS);

      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  });

  /**
   * Restarts geth on a user action, clearing any blocked or failed recovery
   * state first. Skipped while a recovery owns the node lifecycle.
   * @returns {void}
   */
  const restartNodeByUser = (): void => {
    if (nodeRecovery && !nodeRecovery.resume()) return;
    console.log("[network] Restarting node with new configurations...");
    killGethProcess().then(() => {
      setTimeout(() => {
        void spawnGethProcess(store);
      }, NODE_RESTART_DELAY_MS);
    });
  };

  ipcMain.on("network:restartNode", restartNodeByUser);
  ipcMain.handle(NODE_CHANNELS.RETRY, restartNodeByUser);
  ipcMain.handle(
    NODE_CHANNELS.GET_RECOVERY_STATE,
    () => nodeRecovery?.getActiveEvent() ?? null,
  );

  ipcMain.on("window-minimize", (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    if (win) {
      win.minimize();
    }
  });

  ipcMain.on("window-close", (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    if (win) {
      win.close();
    }
  });

  resolvedRpcPort = await findAvailablePort(DEFAULT_RPC_PORT);
  resolvedAuthRpcPort = await findAvailablePort(
    DEFAULT_AUTH_RPC_PORT,
    resolvedRpcPort,
  );

  loadNetworkId(store);

  nodeRecovery = new GethRecovery({
    spawnGeth: () => spawnGethProcess(store),
    stopGeth: killGethProcess,
    hasGethExited,
    initGenesis: initGethIfNeeded,
    resolveDataDir,
    resolveRpcPort: () =>
      (store.get("advanced.httpRpc") ?? true) ? resolvedRpcPort : null,
    broadcast: (event) => {
      reportRecoveryEvent(event);
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(NODE_CHANNELS.RECOVERY, event);
      });
    },
  });

  try {
    await initGethIfNeeded(resolveDataDir());
  } catch (err) {
    console.error("[geth:init] Fatal error during genesis init:", err);
  }

  await prepareGethIpcEndpoint(store);
  await spawnGethProcess(store);

  const miningController = new MiningController(resolvedRpcPort, store);
  const removeRendererRpcHandler = registerRendererRpcHandler(
    () => resolvedRpcPort,
  );

  const win = createWindow();
  initUpdater(win);
  miningController.setWindow(win);

  const extSyncServer = startExtensionSyncServer(store, resolvedRpcPort, win);

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on("before-quit", () => {
    extSyncServer.close();
    removeRendererRpcHandler();
  });
});

/**
 * Intercepts the quit sequence so the app does not terminate until the geth
 * child process has been given a chance to persist its chain state to disk.
 */
app.on("before-quit", (e) => {
  if (isAppQuitting) {
    return;
  }
  e.preventDefault();
  isAppQuitting = true;
  killGethProcess()
    .then(removeTemporaryIpcDir)
    .then(() => {
      app.exit();
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("SIGINT", () => {
  if (isAppQuitting) return;
  isAppQuitting = true;
  killGethProcess()
    .then(removeTemporaryIpcDir)
    .then(() => {
      app.exit();
    });
});

process.on("SIGTERM", () => {
  if (isAppQuitting) return;
  isAppQuitting = true;
  killGethProcess()
    .then(removeTemporaryIpcDir)
    .then(() => {
      app.exit();
    });
});
