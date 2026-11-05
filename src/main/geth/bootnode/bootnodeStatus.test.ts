import { describe, expect, it, vi } from "vitest";
import { SigningKey, toBeHex } from "ethers";
import { probeBootnodes, toConnectedNodeIds } from "./bootnodeStatus";

vi.mock("../rpc/rpcUtils", () => ({ callGethRpcRaw: vi.fn() }));
vi.mock("../process/ports", () => ({ getRpcPort: () => 8545 }));

function nodeIdFor(seed: number): string {
  return new SigningKey(toBeHex(seed, 32)).publicKey.slice(4);
}

const PEER_ID = nodeIdFor(1);
const OTHER_ID = nodeIdFor(2);
const PEER_ENODE = `enode://${PEER_ID}@10.0.0.1:30303`;
const OTHER_ENODE = `enode://${OTHER_ID}@10.0.0.2:30303`;
const CHECKED_AT_MS = 1_700_000_000_000;
const LATENCY_MS = 12;

// Trimmed admin_peers entry: "id" is the keccak hash of the key, not the key.
const ADMIN_PEERS = [
  {
    id: "f".repeat(64),
    enode: `enode://${PEER_ID.toUpperCase()}@10.0.0.1:41234?discport=0`,
    network: { remoteAddress: "10.0.0.1:41234" },
  },
  { id: "e".repeat(64) },
  "garbage",
];

describe("toConnectedNodeIds", () => {
  it("matches peers by the key in their enode, case-insensitively", () => {
    expect(toConnectedNodeIds(ADMIN_PEERS)).toEqual(new Set([PEER_ID]));
  });

  it.each([null, {}, "x"])("returns no ids for %j", (value) => {
    expect(toConnectedNodeIds(value).size).toBe(0);
  });
});

describe("probeBootnodes", () => {
  it("reports latency, peer status and the check time per node", async () => {
    const probe = vi.fn(async (host: string) =>
      host === "10.0.0.1" ? LATENCY_MS : null,
    );

    const statuses = await probeBootnodes([PEER_ENODE, OTHER_ENODE], {
      probe,
      getPeers: async () => ADMIN_PEERS,
      nowMs: () => CHECKED_AT_MS,
    });

    expect(probe).toHaveBeenCalledWith("10.0.0.1", 30303);
    expect(statuses).toEqual([
      {
        enode: PEER_ENODE,
        latencyMs: LATENCY_MS,
        isPeer: true,
        checkedAtMs: CHECKED_AT_MS,
      },
      {
        enode: OTHER_ENODE,
        latencyMs: null,
        isPeer: false,
        checkedAtMs: CHECKED_AT_MS,
      },
    ]);
  });

  it("leaves the peer status unknown while the local node is stopped", async () => {
    const [status] = await probeBootnodes([PEER_ENODE], {
      probe: async () => LATENCY_MS,
      getPeers: async () => null,
      nowMs: () => CHECKED_AT_MS,
    });

    expect(status.isPeer).toBeNull();
  });
});
