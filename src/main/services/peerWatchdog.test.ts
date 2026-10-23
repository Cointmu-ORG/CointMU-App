import { createServer, type Server } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodePeerHint } from "../../bridge/types";
import {
  NO_PEERS_GRACE_MS,
  PEER_POLL_INTERVAL_MS,
  PROBE_BACKOFF_MS,
  PeerWatchdog,
  isTcpReachable,
} from "./peerWatchdog";

const PROBE_TIMEOUT_MS = 500;

interface Harness {
  watchdog: PeerWatchdog;
  hints: (NodePeerHint | null)[];
  state: { isRunning: boolean; peerCount: number | null; isReachable: boolean };
  probe: ReturnType<typeof vi.fn>;
}

function createHarness(): Harness {
  const state = {
    isRunning: true,
    peerCount: 0 as number | null,
    isReachable: false,
  };
  const hints: (NodePeerHint | null)[] = [];
  const probe = vi.fn(async () => state.isReachable);
  const watchdog = new PeerWatchdog({
    isGethRunning: () => state.isRunning,
    getPeerCount: async () => state.peerCount,
    isBootnodeReachable: probe,
    broadcast: (hint) => hints.push(hint),
  });
  return { watchdog, hints, state, probe };
}

/** Ticks once per poll interval until `durationMs` of fake time has passed. */
async function runFor(
  watchdog: PeerWatchdog,
  durationMs: number,
): Promise<void> {
  for (
    let elapsed = 0;
    elapsed < durationMs;
    elapsed += PEER_POLL_INTERVAL_MS
  ) {
    await watchdog.tick();
    vi.advanceTimersByTime(PEER_POLL_INTERVAL_MS);
  }
}

describe("PeerWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not probe before the grace period has passed", async () => {
    const { watchdog, probe, hints } = createHarness();

    await runFor(watchdog, NO_PEERS_GRACE_MS);

    expect(probe).not.toHaveBeenCalled();
    expect(hints).toEqual([]);
  });

  it("reports an unreachable bootnode after the grace period", async () => {
    const { watchdog, probe, hints } = createHarness();

    await runFor(watchdog, NO_PEERS_GRACE_MS + PEER_POLL_INTERVAL_MS);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(hints).toEqual([NodePeerHint.BOOTNODE_UNREACHABLE]);
    expect(watchdog.getHint()).toBe(NodePeerHint.BOOTNODE_UNREACHABLE);
  });

  it("reports a reachable bootnode with no peers differently", async () => {
    const { watchdog, state, hints } = createHarness();
    state.isReachable = true;

    await runFor(watchdog, NO_PEERS_GRACE_MS + PEER_POLL_INTERVAL_MS);

    expect(hints).toEqual([NodePeerHint.BOOTNODE_REACHABLE_NO_PEERS]);
  });

  it("re-probes on the backoff schedule and broadcasts only changes", async () => {
    const { watchdog, probe, hints } = createHarness();
    const [first, second] = PROBE_BACKOFF_MS;

    await runFor(watchdog, NO_PEERS_GRACE_MS + PEER_POLL_INTERVAL_MS);
    await runFor(watchdog, first);
    expect(probe).toHaveBeenCalledTimes(2);

    await runFor(watchdog, second - PEER_POLL_INTERVAL_MS);
    expect(probe).toHaveBeenCalledTimes(2);

    await runFor(watchdog, PEER_POLL_INTERVAL_MS);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(hints).toEqual([NodePeerHint.BOOTNODE_UNREACHABLE]);
  });

  it("clears the hint and restarts the grace period once a peer connects", async () => {
    const { watchdog, state, probe, hints } = createHarness();
    await runFor(watchdog, NO_PEERS_GRACE_MS + PEER_POLL_INTERVAL_MS);

    state.peerCount = 1;
    await watchdog.tick();
    state.peerCount = 0;
    await runFor(watchdog, NO_PEERS_GRACE_MS);

    expect(hints).toEqual([NodePeerHint.BOOTNODE_UNREACHABLE, null]);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("clears the hint while geth is not running", async () => {
    const { watchdog, state, hints } = createHarness();
    await runFor(watchdog, NO_PEERS_GRACE_MS + PEER_POLL_INTERVAL_MS);

    state.isRunning = false;
    await watchdog.tick();

    expect(hints.at(-1)).toBeNull();
  });

  it("ignores polls where geth does not answer", async () => {
    const { watchdog, state, probe } = createHarness();
    state.peerCount = null;

    await runFor(watchdog, NO_PEERS_GRACE_MS * 2);

    expect(probe).not.toHaveBeenCalled();
  });
});

describe("isTcpReachable", () => {
  let server: Server | null = null;

  afterEach(async () => {
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    );
    server = null;
  });

  it("is true when a local listener accepts the connection", async () => {
    server = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) =>
      server?.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    await expect(
      isTcpReachable("127.0.0.1", port, PROBE_TIMEOUT_MS),
    ).resolves.toBe(true);
  });

  it("is false when nothing listens on the port", async () => {
    server = createServer();
    await new Promise<void>((resolve) =>
      server?.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;

    await expect(
      isTcpReachable("127.0.0.1", port, PROBE_TIMEOUT_MS),
    ).resolves.toBe(false);
  });
});
