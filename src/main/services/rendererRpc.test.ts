import { describe, expect, it } from "vitest";
import { rejectRendererRpc } from "./rendererRpc";

describe("rejectRendererRpc", () => {
  it("accepts an allowed method with array params", () => {
    expect(rejectRendererRpc("eth_blockNumber", [])).toBeNull();
    expect(rejectRendererRpc("miner_setEtherbase", ["0x01"])).toBeNull();
  });

  it.each([
    ["a non-string method", 42, []],
    ["object params", "eth_call", { to: "0x" }],
    ["missing params", "eth_call", undefined],
  ])("rejects %s as invalid", (_label, method, params) => {
    expect(rejectRendererRpc(method, params)).toHaveProperty(
      "error.code",
      -32602,
    );
  });

  it.each(["admin_startWS", "personal_newAccount", "eth_sign"])(
    "refuses %s",
    (method) => {
      expect(rejectRendererRpc(method, [])).toHaveProperty(
        "error.code",
        -32601,
      );
    },
  );
});
