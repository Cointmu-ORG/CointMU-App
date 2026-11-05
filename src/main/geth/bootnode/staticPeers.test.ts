import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { SigningKey, toBeHex } from "ethers";
import type { JsonRpcEnvelope } from "../../../bridge/types";
import { callGethRpcRaw } from "../rpc/rpcUtils";
import {
  READY_POLL_MS,
  STATIC_PEER_RETRY_MS,
  startStaticPeers,
  stopStaticPeers,
  syncStaticPeers,
} from "./staticPeers";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("../rpc/rpcUtils", () => ({ callGethRpcRaw: vi.fn() }));
vi.mock("../process/ports", () => ({ getRpcPort: () => 8545 }));

function enodeFor(seed: number, host: string): string {
  const nodeId = new SigningKey(toBeHex(seed, 32)).publicKey.slice(4);
  return `enode://${nodeId}@${host}:30303`;
}

const FIRST = enodeFor(1, "10.0.0.1");
const SECOND = enodeFor(2, "10.0.0.2");
const BY_HOST = enodeFor(3, "boot.example");
const BY_HOST_RESOLVED = enodeFor(3, "10.0.0.3");
const OK: JsonRpcEnvelope = { result: true };
const DOWN: JsonRpcEnvelope = {
  error: { code: -32603, message: "geth IPC unreachable" },
};

/** The admin calls made so far, as "method enode". */
function adminCalls(): string[] {
  return vi
    .mocked(callGethRpcRaw)
    .mock.calls.filter(([, method]) => method !== "admin_nodeInfo")
    .map(([, method, params]) => `${method} ${String(params?.[0])}`);
}

describe("static peers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(callGethRpcRaw).mockResolvedValue(OK);
  });

  afterEach(() => {
    stopStaticPeers();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("adds every node as a static and trusted peer once geth answers", async () => {
    vi.mocked(callGethRpcRaw).mockResolvedValueOnce(DOWN);

    startStaticPeers([FIRST, SECOND]);
    await vi.advanceTimersByTimeAsync(READY_POLL_MS);
    expect(adminCalls()).toEqual([]);
    await vi.advanceTimersByTimeAsync(READY_POLL_MS);

    expect(adminCalls()).toEqual([
      `admin_addPeer ${FIRST}`,
      `admin_addTrustedPeer ${FIRST}`,
      `admin_addPeer ${SECOND}`,
      `admin_addTrustedPeer ${SECOND}`,
    ]);
  });

  it("adds new nodes and removes dropped ones without a restart", async () => {
    startStaticPeers([FIRST]);
    await vi.advanceTimersByTimeAsync(READY_POLL_MS);
    vi.mocked(callGethRpcRaw).mockClear();

    await syncStaticPeers([SECOND]);

    expect(adminCalls()).toEqual([
      `admin_removeTrustedPeer ${FIRST}`,
      `admin_removePeer ${FIRST}`,
      `admin_addPeer ${SECOND}`,
      `admin_addTrustedPeer ${SECOND}`,
    ]);
  });

  it("adds a hostname node by IP once DNS recovers", async () => {
    vi.mocked(lookup)
      .mockRejectedValueOnce(new Error("ENOTFOUND"))
      .mockResolvedValueOnce({ address: "10.0.0.3", family: 4 } as never);

    startStaticPeers([BY_HOST]);
    await vi.advanceTimersByTimeAsync(READY_POLL_MS);
    expect(adminCalls()).toEqual([]);
    await vi.advanceTimersByTimeAsync(STATIC_PEER_RETRY_MS);

    expect(adminCalls()).toContain(`admin_addPeer ${BY_HOST_RESOLVED}`);
  });

  it("only records a changed list before geth answers", async () => {
    vi.mocked(callGethRpcRaw).mockResolvedValue(DOWN);
    startStaticPeers([FIRST]);

    await syncStaticPeers([SECOND]);
    vi.mocked(callGethRpcRaw).mockResolvedValue(OK);
    await vi.advanceTimersByTimeAsync(READY_POLL_MS * 2);

    expect(adminCalls()).toEqual([
      `admin_addPeer ${SECOND}`,
      `admin_addTrustedPeer ${SECOND}`,
    ]);
  });

  it("drops the work of a geth that stopped", async () => {
    startStaticPeers([FIRST]);
    stopStaticPeers();

    await vi.advanceTimersByTimeAsync(READY_POLL_MS * 2);

    expect(callGethRpcRaw).not.toHaveBeenCalled();
  });
});
