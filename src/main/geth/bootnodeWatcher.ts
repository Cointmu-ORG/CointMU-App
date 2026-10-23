import { lookup } from "node:dns/promises";
import ms from "ms";
import { formatEnode, parseEnode, resolveBootnodeConfig } from "./bootnode";
import { getRpcPort } from "./ports";
import { callGethRpc } from "../utils/rpcUtils";
import { reportBootnodeConfigProblem } from "../diagnostics/gethReporting";

const BOOTNODE_DNS_RETRY_MS = ms("30s");

// Baked in at build time; a packaged app never sees the CI process.env.
export const BOOTNODE_CONFIG = resolveBootnodeConfig(
  import.meta.env.MAIN_VITE_BOOTNODE_ENODE,
);
if (BOOTNODE_CONFIG.problem) {
  console.warn(
    `[bootnode] MAIN_VITE_BOOTNODE_ENODE is not a valid enode (${BOOTNODE_CONFIG.problem}); expected enode://<secp256k1 public key, 128 hex>@<host>:<port>. Using the built-in bootnode.`,
  );
  reportBootnodeConfigProblem(BOOTNODE_CONFIG.problem);
}
console.log(`[bootnode] Using the ${BOOTNODE_CONFIG.source} bootnode`);

let bootnodeWatcher: NodeJS.Timeout | null = null;
let pendingBootnodeEnode: string | null = null;

/**
 * Records the bootnode the DNS watcher should re-add, or clears it with null.
 * @param {string | null} enode - The configured enode awaiting DNS, or null.
 * @returns {void}
 */
export function setPendingBootnodeEnode(enode: string | null): void {
  pendingBootnodeEnode = enode;
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
 * Starts a periodic watcher that re-resolves a bootnode whose DNS was down at
 * spawn time. Once the hostname resolves again, the peer is added back to the
 * running node via admin_addPeer so it resumes discovery and propagates locally
 * mined blocks without a manual restart.
 * @returns {void}
 */
export function startBootnodeWatcher(): void {
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
    const added = await callGethRpc(getRpcPort(), "admin_addPeer", [resolved]);
    if (added !== null) {
      console.log("[geth] Bootnode reachable again; re-added peer");
      pendingBootnodeEnode = null;
      stopBootnodeWatcher();
    }
  }, BOOTNODE_DNS_RETRY_MS);
}
