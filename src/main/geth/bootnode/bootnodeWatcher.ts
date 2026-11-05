import { type BootnodeConfig, resolveBuildBootnodes } from "./bootnode";
import { BOOTNODES_SETTING_KEY, type SettingsReader } from "./bootnodeSettings";
import { resolveBootnodeConfig } from "./bootnodeState";
import {
  resolveBootnodeEnode,
  startStaticPeers,
  stopStaticPeers,
} from "./staticPeers";
import {
  reportBootnodeConfigProblem,
  reportBootnodeSource,
} from "../../diagnostics/gethReporting";

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

// The config the running geth was started with (null while stopped); the peer watchdog probes it.
let activeBootnodeConfig: BootnodeConfig | null = null;

/**
 * Resolves the nodes for the next geth start: the defaults (build value or
 * fallback) the user kept enabled, plus the nodes the user added. A saved
 * setting that fails validation is ignored and reported (by source only,
 * never the enodes).
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
      `[bootnode] Ignoring the saved nodes (${config.problem}); using the ${config.source} bootnodes.`,
    );
    reportBootnodeConfigProblem(config.problem);
  }
  return config;
}

/** @returns The config the running geth was started with, or null before the first start. */
export function getActiveBootnodeConfig(): BootnodeConfig | null {
  return activeBootnodeConfig;
}

/**
 * Forgets the stopped node's bootnodes and static peers; called when geth
 * stops. Until the next start, the settings view then compares against what
 * that start will use.
 */
export function forgetRunningBootnodes(): void {
  activeBootnodeConfig = null;
  stopStaticPeers();
}

/**
 * Builds the --bootnodes argument for the next geth start, records the config
 * as active, and queues every node as a static peer for when geth answers.
 * Hostnames are pre-resolved so a DNS outage cannot abort startup: unresolved
 * entries are left out of --bootnodes and added as static peers once DNS
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
  const unresolvedCount = config.enodes.length - dialable.length;
  if (unresolvedCount > 0) {
    console.warn(
      `[geth:spawn] ${unresolvedCount} bootnode(s) unresolved by DNS; adding them once DNS recovers`,
    );
  }
  startStaticPeers(config.enodes);
  return dialable.length > 0
    ? ["--bootnodes", dialable.join(ENODE_LIST_SEPARATOR)]
    : [];
}
