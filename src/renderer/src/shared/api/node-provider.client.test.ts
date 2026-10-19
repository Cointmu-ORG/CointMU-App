import { Contract, AbiCoder } from "ethers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeProvider } from "./node-provider.client";

const CHAIN_ID_HEX = "0x778";
const TOKEN_ADDRESS = "0x00000000000000000000000000000000000000a1";
const HOLDER_ADDRESS = "0x00000000000000000000000000000000000000b2";
const BALANCE = 1234n;

type Envelope =
  { result: unknown } | { error: { code: number; message: string } };

describe("createNodeProvider", () => {
  let call: ReturnType<
    typeof vi.fn<(method: string, params: unknown[]) => Promise<Envelope>>
  >;

  beforeEach(() => {
    call = vi.fn(async (method: string): Promise<Envelope> => {
      if (method === "eth_chainId") return { result: CHAIN_ID_HEX };
      if (method === "eth_blockNumber") return { result: "0x2a" };
      if (method === "eth_call") {
        return {
          result: AbiCoder.defaultAbiCoder().encode(["uint256"], [BALANCE]),
        };
      }
      return { error: { code: -32000, message: "insufficient funds" } };
    });
    vi.stubGlobal("window", { api: { rpc: { call } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the block number through the IPC bridge", async () => {
    await expect(createNodeProvider().getBlockNumber()).resolves.toBe(42);
    expect(call).toHaveBeenCalledWith("eth_blockNumber", []);
  });

  it("decodes a contract read", async () => {
    const token = new Contract(
      TOKEN_ADDRESS,
      ["function balanceOf(address) view returns (uint256)"],
      createNodeProvider(),
    );
    await expect(token.balanceOf(HOLDER_ADDRESS)).resolves.toBe(BALANCE);
  });

  it("surfaces the node's error message", async () => {
    await expect(
      createNodeProvider().broadcastTransaction("0x02"),
    ).rejects.toThrow(/insufficient funds/);
  });
});
