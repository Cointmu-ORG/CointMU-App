import { describe, expect, it } from "vitest";
import { highestPeerDifficulty, toSyncProgress } from "./syncProgress";

const peer = (difficulty: unknown) => ({ protocols: { eth: { difficulty } } });

describe("toSyncProgress", () => {
  it("is behind when eth_syncing reports a higher block", () => {
    expect(
      toSyncProgress({
        syncing: { currentBlock: "0x64", highestBlock: "0xc8" },
        blockNumber: "0x64",
        peers: [peer(1)],
        latestBlock: { totalDifficulty: "0x10" },
      }),
    ).toEqual({ localBlock: 100, isBehind: true, peers: 1 });
  });

  it("is behind when eth_syncing is false but a peer has more difficulty", () => {
    const progress = toSyncProgress({
      syncing: false,
      blockNumber: "0x64",
      peers: [peer(15), peer(17)],
      latestBlock: { totalDifficulty: "0x10" },
    });
    expect(progress?.isBehind).toBe(true);
  });

  it("is synced when no peer is ahead", () => {
    const progress = toSyncProgress({
      syncing: false,
      blockNumber: "0x64",
      peers: [peer(16)],
      latestBlock: { totalDifficulty: "0x10" },
    });
    expect(progress?.isBehind).toBe(false);
  });

  it("returns null when geth did not answer", () => {
    expect(
      toSyncProgress({
        syncing: null,
        blockNumber: null,
        peers: null,
        latestBlock: null,
      }),
    ).toBeNull();
  });
});

describe("highestPeerDifficulty", () => {
  it("ignores malformed peers", () => {
    expect(highestPeerDifficulty([null, {}, peer("junk"), peer(5)])).toBe(5n);
  });
});
