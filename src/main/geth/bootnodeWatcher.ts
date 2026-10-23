import { lookup } from "node:dns/promises";
import ms from "ms";
import {
  type BootnodeConfig,
  formatEnode,
  parseEnode,
  resolveBootnodeConfig,
  resolveBuildBootnodes,
} from "./bootnode";
import { BOOTNODES_SETTING_KEY, type SettingsReader } from "./bootnodeSettings";
import { getRpcPort } from "./ports";
import { callGethRpc } from "../utils/rpcUtils";
import {
  reportBootnodeConfigProblem,
  reportBootnodeSource,
} from "../diagnostics/gethReporting";

const BOOTNODE_DNS_RETRY_MS = ms("30s");
const ENODE_LIST_SEPARATOR = ",";

// Baked in at build time; a packaged app never sees the CI process.env.
export const DEFAULT_BOOTNODE_CONFIG = resolveBuildBootnodes(
  import.meta.env.MAIN_VITE_BOOTNODE_ENODE,
);
if (DEFAULT_BOOTNODE_CONFIG.problem) {
  console.warn(
    `[bootnode] MAIN_VITE_BOOTNODE_ENODE is not a valid enode list (${DEFAULT_BOOTNODE_CONFIG.problem}); expected enode://<secp256k1 public key, 128 hex>@<host>:<port>, comma-separated. Using the built-in bootnodes.`,
  );
  reportBootnodeConfigProblem(DEFAULT_BOOTNODE_CONFIG.problem);
}

let bootnodeWatcher: NodeJS.Timeout | null = null;
let pendingBootnodeEnodes: readonly string[] = [];
// The config the running geth was started with; the peer watchdog probes it.
let activeBootnodeConfig: BootnodeConfig | null = null;

/**
 * Resolves the bootnodes for the next geth start: the saved user list, then
 * the build value, then the fallback. A saved list that fails validation is
 * ignored and reported (by source only, never the enodes).
 * @param store - The settings store.
 * @returns The bootnode config to use.
 */
export function getBootnodeConfig(store: SettingsReader): BootnodeConfig {
  const config = resolveBootnodeConfig(
    store.get(BOOTNODES_SETTING_KEY),
    DEFAULT_BOOTNODE_CONFIG,
  );
  if (config.problem && config.problem !== DEFAULT_BOOTNODE_CONFIG.problem) {
    console.warn(
      `[bootnode] Ignoring the saved bootnodes (${config.problem}); using the ${config.source} bootnodes.`,
    );
    reportBootnodeConfigProblem(config.problem);
  }
  return config;
}

/** @returns The config the running geth was started with, or null before the first start. */
export function getActiveBootnodeConfig(): BootnodeConfig | null {
  return activeBootnodeConfig;
}

/** Clears the DNS retry list and stops the watcher; called when geth stops. */
export function clearPendingBootnodes(): void {
  pendingBootnodeEnodes = [];
  stopBootnodeWatcher();
}

/**
 * Resolves an enode's hostname to an IP so geth never depends on its own DNS
 * resolution. IP-based enodes are returned unchanged. Returns null when the
 * hostname cannot currently be resolved, signaling a DNS outage.
 * @param {string} enode - The configured bootnode enode URL.
 * @returns {Promise<string | null>} The IP-rewritten enode, or null on failure.
 */
export async function resolveBootnodeEnode(
  enode: string,
): Promise<string | null> {
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
 * Builds the --bootnodes argument for the next geth start and records the
 * config as active. Hostnames are pre-resolved so a DNS outage cannot abort
 * startup: unresolved entries are left out and a watcher adds them once DNS
 * recovers. When none resolve, geth starts without bootnodes.
 * @param store - The settings store.
 * @returns The geth arguments, or an empty list when no bootnode resolved.
 */
export async function prepareBootnodeArgs(
  store: SettingsReader,
): Promise<string[]> {
  const config = getBootnodeConfig(store);
  activeBootnodeConfig = config;
  console.log(
    `[bootnode] Using ${config.enodes.length} ${config.source} bootnode(s)`,
  );
  reportBootnodeSource(config.source);

  const resolved = await Promise.all(config.enodes.map(resolveBootnodeEnode));
  const dialable = resolved.filter((enode): enode is string => enode !== null);
  pendingBootnodeEnodes = config.enodes.filter(
    (_, index) => resolved[index] === null,
  );
  if (pendingBootnodeEnodes.length > 0) {
    console.warn(
      `[geth:spawn] ${pendingBootnodeEnodes.length} bootnode(s) unresolved by DNS; re-adding them once DNS recovers`,
    );
    startBootnodeWatcher();
  } else {
    stopBootnodeWatcher();
  }
  return dialable.length > 0
    ? ["--bootnodes", dialable.join(ENODE_LIST_SEPARATOR)]
    : [];
}

/**
 * Stops the bootnode DNS-recovery watcher if it is running.
 * @returns {void}
 */
export function stopBootnodeWatcher(): void {
  if (bootnodeWatcher) {
    clearInterval(bootnodeWatcher);
    bootnodeWatcher = null;
  }
}

/**
 * Re-resolves each pending bootnode and adds the ones that resolve to the
 * running node via admin_addPeer.
 * @returns The bootnodes that are still pending.
 */
async function retryPendingBootnodes(): Promise<readonly string[]> {
  const stillPending: string[] = [];
  for (const enode of pendingBootnodeEnodes) {
    const resolved = await resolveBootnodeEnode(enode);
    const added = resolved
      ? await callGethRpc(getRpcPort(), "admin_addPeer", [resolved])
      : null;
    if (added === null) stillPending.push(enode);
  }
  return stillPending;
}

/**
 * Starts a periodic watcher that re-resolves bootnodes whose DNS was down at
 * spawn time. Once a hostname resolves again, the peer is added back to the
 * running node via admin_addPeer so it resumes discovery and propagates locally
 * mined blocks without a manual restart.
 * @returns {void}
 */
function startBootnodeWatcher(): void {
  if (bootnodeWatcher) {
    return;
  }
  bootnodeWatcher = setInterval(async () => {
    const before = pendingBootnodeEnodes;
    const stillPending = await retryPendingBootnodes();
    // A restart may have replaced the list while the retry was in flight.
    if (pendingBootnodeEnodes !== before) return;
    if (stillPending.length < before.length) {
      console.log("[geth] Bootnode reachable again; re-added peer");
    }
    pendingBootnodeEnodes = stillPending;
    if (stillPending.length === 0) stopBootnodeWatcher();
  }, BOOTNODE_DNS_RETRY_MS);
}
