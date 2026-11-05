import type { BootnodeStatus } from "../../../bridge/types";
import { parseEnode } from "./bootnode";
import { probeTcpLatency } from "../../mining/peerWatchdog";
import { getRpcPort } from "../process/ports";
import { callGethRpcRaw } from "../rpc/rpcUtils";

// admin_peers enodes are geth's own and may carry ?discport=0, which
// parseEnode rejects for user input; only the key is needed here.
const PEER_NODE_ID = /^enode:\/\/([0-9a-f]{128})@/i;

/** Short: an answering node replies in well under a second on campus. */
export const NODE_PROBE_TIMEOUT_MS = 3_000;
const ADMIN_PEERS_TIMEOUT_MS = 5_000;

export interface BootnodeProbeDeps {
  /** Resolves the TCP connect time, or null when the port did not answer. */
  readonly probe: (host: string, port: number) => Promise<number | null>;
  /** Resolves admin_peers, or null when the local node is not answering. */
  readonly getPeers: () => Promise<unknown>;
  readonly nowMs: () => number;
}

/**
 * Collects the node ids of the connected peers from an admin_peers result.
 * The node id is the public key in each peer's enode URL; admin_peers' own
 * "id" field is its hash, so it cannot be compared with an enode.
 * @param peers - The admin_peers result.
 * @returns The lowercase node ids; empty for anything that is not a peer list.
 */
export function toConnectedNodeIds(peers: unknown): ReadonlySet<string> {
  if (!Array.isArray(peers)) return new Set();
  const ids = peers.map((peer: unknown) => {
    const enode =
      typeof peer === "object" && peer !== null && "enode" in peer
        ? peer.enode
        : null;
    return typeof enode === "string"
      ? PEER_NODE_ID.exec(enode)?.[1].toLowerCase()
      : undefined;
  });
  return new Set(ids.filter((id): id is string => id !== undefined));
}

/**
 * Probes each node over TCP, in parallel, and checks whether the local node
 * is peered with it.
 * @param enodes - The nodes to check.
 * @param deps - The probe, the admin_peers reader and the clock.
 * @returns One status per enode, in input order.
 */
export async function probeBootnodes(
  enodes: readonly string[],
  deps: BootnodeProbeDeps,
): Promise<BootnodeStatus[]> {
  const [peers, latencies] = await Promise.all([
    deps.getPeers(),
    Promise.all(
      enodes.map((enode) => {
        const parsed = parseEnode(enode);
        return parsed ? deps.probe(parsed.host, parsed.port) : null;
      }),
    ),
  ]);
  const peerIds = peers === null ? null : toConnectedNodeIds(peers);
  const checkedAtMs = deps.nowMs();
  return enodes.map((enode, index) => {
    const nodeId = parseEnode(enode)?.nodeId ?? "";
    return {
      enode,
      latencyMs: latencies[index],
      isPeer: peerIds === null ? null : peerIds.has(nodeId),
      checkedAtMs,
    };
  });
}

async function readAdminPeers(): Promise<unknown> {
  const envelope = await callGethRpcRaw(
    getRpcPort(),
    "admin_peers",
    [],
    ADMIN_PEERS_TIMEOUT_MS,
  );
  return "result" in envelope ? envelope.result : null;
}

/** Probes over the network and the local geth IPC endpoint. */
export const LIVE_PROBE_DEPS: BootnodeProbeDeps = {
  probe: (host, port) => probeTcpLatency(host, port, NODE_PROBE_TIMEOUT_MS),
  getPeers: readAdminPeers,
  nowMs: Date.now,
};
