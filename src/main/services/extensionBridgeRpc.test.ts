import { describe, expect, it, vi } from "vitest";
import { rejectBridgeRpcMethod } from "./extensionBridgeRpc";

// The real module downloads the Electron binary on first require (#74).
vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: vi.fn() } }));

const EIP1193_UNSUPPORTED_METHOD = 4200;

describe("rejectBridgeRpcMethod", () => {
  it.each(["eth_accounts", "eth_requestAccounts", "eth_call", "net_version"])(
    "allows %s",
    (method) => {
      expect(rejectBridgeRpcMethod(method)).toBeNull();
    },
  );

  it.each(["miner_setEtherbase", "admin_startWS", "personal_newAccount"])(
    "refuses node control method %s with 4200",
    (method) => {
      expect(rejectBridgeRpcMethod(method)).toEqual({
        error: {
          code: EIP1193_UNSUPPORTED_METHOD,
          message: `${method} is not available through the CointMU desktop bridge.`,
        },
      });
    },
  );

  it("explains that desktop mode cannot sign yet", () => {
    const rejection = rejectBridgeRpcMethod("eth_sendTransaction");
    expect(rejection).toHaveProperty("error.code", EIP1193_UNSUPPORTED_METHOD);
    expect(rejection).toHaveProperty(
      "error.message",
      expect.stringContaining("standalone mode"),
    );
  });
});
