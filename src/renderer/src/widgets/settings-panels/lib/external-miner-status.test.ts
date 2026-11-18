import { describe, expect, it } from "vitest";
import {
  ExternalMinerStatus,
  resolveExternalMinerStatus,
} from "./external-miner-status";

describe("resolveExternalMinerStatus", () => {
  it("is off while the CPU miner is in use, whatever the node reports", () => {
    expect(
      resolveExternalMinerStatus(false, { isMining: true, hashrate: 900 }),
    ).toBe(ExternalMinerStatus.OFF);
  });

  it.each([null, { isMining: false, hashrate: 0 }])(
    "is idle while the node hands out no work (%j)",
    (stats) => {
      expect(resolveExternalMinerStatus(true, stats)).toBe(
        ExternalMinerStatus.IDLE,
      );
    },
  );

  it("waits until a miner submits a hashrate", () => {
    expect(
      resolveExternalMinerStatus(true, { isMining: true, hashrate: 0 }),
    ).toBe(ExternalMinerStatus.WAITING);
  });

  it("reports once a hashrate is submitted", () => {
    expect(
      resolveExternalMinerStatus(true, {
        isMining: true,
        hashrate: 25_000_000,
      }),
    ).toBe(ExternalMinerStatus.REPORTING);
  });
});
