import { describe, expect, it, vi } from "vitest";
import { ActivityKind } from "../../bridge/types";
import { scanWalletActivity } from "./activityScanner";
import { callGethRpc } from "../utils/rpcUtils";

vi.mock("../utils/rpcUtils", () => ({
  callGethRpc: vi.fn(),
  toHex: (n: number) => `0x${n.toString(16)}`,
  safeParseHex: (v: string) => parseInt(v, 16),
}));

const ME = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const ONE_CMU_HEX = "0xde0b6b3a7640000";

const BLOCK = {
  number: "0x2",
  timestamp: "0x64",
  miner: ME,
  transactions: [
    { hash: "0xa", from: ME, to: OTHER, value: ONE_CMU_HEX, input: "0x" },
    { hash: "0xb", from: OTHER, to: ME, value: ONE_CMU_HEX, input: "0x" },
    { hash: "0xc", from: ME, to: OTHER, value: "0x0", input: "0x1234" },
    { hash: "0xd", from: ME, to: null, value: "0x0", input: "0x6080" },
    { hash: "0xe", from: OTHER, to: OTHER, value: "0x0", input: "0x" },
  ],
};

describe("scanWalletActivity", () => {
  it("returns raw kinds and confirmations, with no display text", async () => {
    vi.mocked(callGethRpc).mockImplementation(async (_port, method, params) => {
      if (method === "eth_blockNumber") return "0x2";
      return (params as unknown[])[0] === "0x2" ? BLOCK : null;
    });

    const items = await scanWalletActivity(8545, [ME]);

    expect(items.map((item) => [item.id, item.kind])).toEqual([
      ["block-0x2", ActivityKind.MINING_REWARD],
      ["0xa", ActivityKind.SEND],
      ["0xb", ActivityKind.RECEIVE],
      ["0xc", ActivityKind.CONTRACT_CALL],
      ["0xd", ActivityKind.CONTRACT_DEPLOY],
    ]);
    expect(items[1]).toEqual({
      id: "0xa",
      kind: ActivityKind.SEND,
      amount: "1.00",
      timestamp: 100,
      blockNumber: 2,
      confirmations: 1,
      hash: "0xa",
      from: ME,
      to: OTHER,
    });
    expect(items[4].to).toBe("");
  });
});
