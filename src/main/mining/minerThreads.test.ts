import { describe, expect, it } from "vitest";
import { resolveMinerThreads } from "./minerThreads";

describe("resolveMinerThreads", () => {
  it("turns CPU sealing off for an external miner", () => {
    expect(resolveMinerThreads(true, 8)).toBe(0);
  });

  it("uses the stored whole thread count for the CPU miner", () => {
    expect(resolveMinerThreads(false, 6.9)).toBe(6);
    expect(resolveMinerThreads(undefined, 2)).toBe(2);
  });

  it.each([undefined, 0, "abc", 0.5])(
    "falls back to the default for the thread count %s",
    (cpuThreads) => {
      expect(resolveMinerThreads(false, cpuThreads)).toBe(4);
    },
  );

  it("only accepts a stored true as the external switch", () => {
    expect(resolveMinerThreads("true", 3)).toBe(3);
  });
});
