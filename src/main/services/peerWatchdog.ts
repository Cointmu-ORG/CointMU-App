import { connect } from "node:net";
import ms from "ms";
import { NodePeerHint } from "../../bridge/types";
import { parseEnode } from "../geth/bootnode";

export const PEER_POLL_INTERVAL_MS = ms("30s");
/** How long the node must run with zero peers before the bootnode is probed. */
export const NO_PEERS_GRACE_MS = ms("3m");
/** Wait before each re-probe while peers stay at zero; the last value repeats. */
export const PROBE_BACKOFF_MS = [ms("1m"), ms("2m"), ms("5m"), ms("10m")];

export interface PeerWatchdogDeps {
  readonly isGethRunning: () => boolean;
  /** Resolves the connected peer count, or null when geth did not answer. */
  readonly getPeerCount: () => Promise<number | null>;
  readonly isBootnodeReachable: () => Promise<boolean>;
  /** Called only when the hint changes. */
  readonly broadcast: (hint: NodePeerHint | null) => void;
}

/**
 * Explains a node that keeps zero peers: after NO_PEERS_GRACE_MS it probes the
 * bootnode over TCP and reports whether it is unreachable (off campus, no VPN)
 * or reachable while still peerless (a network or enode mismatch). Probes back
 * off per PROBE_BACKOFF_MS; any peer or a stopped node resets everything.
 */
export class PeerWatchdog {
  private hint: NodePeerHint | null = null;
  private noPeersSinceMs: number | null = null;
  private nextProbeAtMs = 0;
  private probeCount = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: PeerWatchdogDeps) {}

  /** Starts polling without keeping the process alive; repeated calls are ignored. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), PEER_POLL_INTERVAL_MS);
    this.timer.unref();
  }

  /** @returns The current hint, or null while the node has peers or is idle. */
  getHint(): NodePeerHint | null {
    return this.hint;
  }

  /** Runs one poll: reads the peer count and probes the bootnode when due. */
  async tick(): Promise<void> {
    if (!this.deps.isGethRunning()) return this.reset();
    const peerCount = await this.deps.getPeerCount();
    if (peerCount === null) return;
    if (peerCount > 0) return this.reset();

    const nowMs = Date.now();
    this.noPeersSinceMs ??= nowMs;
    if (nowMs - this.noPeersSinceMs < NO_PEERS_GRACE_MS) return;
    if (nowMs < this.nextProbeAtMs) return;

    const isReachable = await this.deps.isBootnodeReachable();
    const backoffIndex = Math.min(this.probeCount, PROBE_BACKOFF_MS.length - 1);
    this.nextProbeAtMs = nowMs + PROBE_BACKOFF_MS[backoffIndex];
    this.probeCount++;
    this.setHint(
      isReachable
        ? NodePeerHint.BOOTNODE_REACHABLE_NO_PEERS
        : NodePeerHint.BOOTNODE_UNREACHABLE,
    );
  }

  private reset(): void {
    this.noPeersSinceMs = null;
    this.nextProbeAtMs = 0;
    this.probeCount = 0;
    this.setHint(null);
  }

  private setHint(hint: NodePeerHint | null): void {
    if (hint === this.hint) return;
    this.hint = hint;
    console.warn(`[peers] Peer hint: ${hint ?? "cleared"}`);
    this.deps.broadcast(hint);
  }
}

/**
 * Checks whether a TCP connection to host:port can be opened. Outbound only;
 * the socket is closed as soon as the outcome is known.
 * @param host - Hostname or IP.
 * @param port - TCP port.
 * @param timeoutMs - How long to wait for the connection.
 * @returns True when the connection was established in time.
 */
export function isTcpReachable(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (isReachable: boolean): void => {
      socket.destroy();
      resolve(isReachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/**
 * Probes a list of bootnodes in parallel.
 * @param enodes - The enodes the running node was started with.
 * @param isReachable - Probes one host:port.
 * @returns True when at least one bootnode answers; false for an empty list.
 */
export async function isAnyBootnodeReachable(
  enodes: readonly string[],
  isReachable: (host: string, port: number) => Promise<boolean>,
): Promise<boolean> {
  const results = await Promise.all(
    enodes.map((enode) => {
      const parsed = parseEnode(enode);
      return parsed ? isReachable(parsed.host, parsed.port) : false;
    }),
  );
  return results.includes(true);
}
