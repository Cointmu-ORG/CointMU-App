import { lookup } from "node:dns/promises";
import ms from "ms";
import { formatEnode, parseEnode } from "./bootnode";
import { getRpcPort } from "../process/ports";
import { callGethRpcRaw } from "../rpc/rpcUtils";

/** How often to ask a starting geth whether its IPC endpoint answers. */
export const READY_POLL_MS = ms("2s");
/** Gives up on a geth that never answers; the next start tries again. */
export const READY_MAX_ATTEMPTS = 60;
/** Retry for nodes not registered yet, e.g. a hostname DNS cannot resolve. */
export const STATIC_PEER_RETRY_MS = ms("30s");
const ADMIN_TIMEOUT_MS = ms("5s");

// The enodes the user's list asks for, as configured.
let desired: readonly string[] = [];
// Configured enode → the IP enode geth was given.
const registered = new Map<string, string>();
let isReady = false;
let readyAttempts = 0;
let timer: NodeJS.Timeout | null = null;
// Bumped on every start and stop so work for a stopped geth is dropped.
let generation = 0;

/**
 * Resolves an enode's hostname to an IP so geth never depends on its own DNS
 * resolution. IP-based enodes are returned unchanged.
 * @param enode - A configured enode URL.
 * @returns The IP-rewritten enode, or null when it cannot be resolved now.
 */
export async function resolveBootnodeEnode(
  enode: string,
): Promise<string | null> {
  const parsed = parseEnode(enode);
  if (!parsed) return null;
  if (parsed.isIp) return enode;
  try {
    const { address } = await lookup(parsed.host);
    return formatEnode(parsed, address);
  } catch {
    // A DNS outage; the retry adds the node once it resolves.
    return null;
  }
}

async function callAdmin(method: string, params: unknown[]): Promise<boolean> {
  const envelope = await callGethRpcRaw(
    getRpcPort(),
    method,
    params,
    ADMIN_TIMEOUT_MS,
  );
  if ("error" in envelope) {
    console.warn(`[bootnode] ${method} failed: ${envelope.error.message}`);
    return false;
  }
  return true;
}

async function isAdminReady(): Promise<boolean> {
  const envelope = await callGethRpcRaw(
    getRpcPort(),
    "admin_nodeInfo",
    [],
    ADMIN_TIMEOUT_MS,
  );
  return "result" in envelope;
}

async function addStaticPeer(enode: string, dialed: string): Promise<void> {
  if (!(await callAdmin("admin_addPeer", [dialed]))) return;
  // Trusted peers may connect even when --maxpeers is full.
  await callAdmin("admin_addTrustedPeer", [dialed]);
  registered.set(enode, dialed);
}

async function removeStaticPeer(enode: string, dialed: string): Promise<void> {
  await callAdmin("admin_removeTrustedPeer", [dialed]);
  await callAdmin("admin_removePeer", [dialed]);
  registered.delete(enode);
}

async function reconcile(run: number): Promise<void> {
  for (const [enode, dialed] of [...registered]) {
    if (run !== generation) return;
    if (!desired.includes(enode)) await removeStaticPeer(enode, dialed);
  }
  for (const enode of desired) {
    if (registered.has(enode)) continue;
    const dialed = await resolveBootnodeEnode(enode);
    if (run !== generation) return;
    if (dialed) await addStaticPeer(enode, dialed);
  }
}

function schedule(delayMs: number): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void tick();
  }, delayMs);
  timer.unref();
}

async function waitUntilReady(run: number): Promise<boolean> {
  isReady = await isAdminReady();
  if (run !== generation || isReady) return isReady;
  readyAttempts++;
  if (readyAttempts < READY_MAX_ATTEMPTS) {
    schedule(READY_POLL_MS);
  } else {
    console.warn("[bootnode] geth IPC never answered; static peers not added");
  }
  return false;
}

async function tick(): Promise<void> {
  const run = generation;
  if (!isReady && !(await waitUntilReady(run))) return;
  await reconcile(run);
  if (run !== generation) return;
  const pending = desired.length - registered.size;
  if (pending > 0) {
    console.warn(`[bootnode] ${pending} node(s) not added yet; retrying`);
    schedule(STATIC_PEER_RETRY_MS);
  }
}

/** Forgets the stopped geth's static peers and cancels pending work. */
export function stopStaticPeers(): void {
  generation++;
  desired = [];
  registered.clear();
  isReady = false;
  readyAttempts = 0;
  if (timer) clearTimeout(timer);
  timer = null;
}

/**
 * Adds every node as a static and trusted peer (admin_addPeer,
 * admin_addTrustedPeer over IPC) once the geth being started answers, so geth
 * keeps redialing each of them. Geth forgets static peers on exit, so this
 * runs on every start, restarts and recoveries included.
 * @param enodes - The configured enodes, hostnames allowed.
 */
export function startStaticPeers(enodes: readonly string[]): void {
  stopStaticPeers();
  desired = enodes;
  schedule(READY_POLL_MS);
}

/**
 * Brings the running geth's static peers in line with a changed list without
 * a restart: adds the new nodes and removes the dropped ones. Before geth
 * answers, the list is only recorded; the first registration uses it.
 * @param enodes - The configured enodes to keep as static peers.
 */
export async function syncStaticPeers(
  enodes: readonly string[],
): Promise<void> {
  desired = enodes;
  if (!isReady) return;
  await tick();
}
