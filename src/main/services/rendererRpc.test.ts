import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { registerRendererRpcHandler, rejectRendererRpc } from "./rendererRpc";

// The real module downloads the Electron binary on first require (#74).
vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));

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

describe("registerRendererRpcHandler", () => {
  /** @returns A loopback port nothing listens on. */
  async function closedPort(): Promise<number> {
    const server = createServer().listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    server.close();
    await once(server, "close");
    return port;
  }

  it("answers with an error envelope while geth is down, as during quit", async () => {
    const port = await closedPort();
    registerRendererRpcHandler(() => port);
    const [[channel, handler]] = vi.mocked(ipcMain.handle).mock.calls;

    const envelope = await handler(
      {} as IpcMainInvokeEvent,
      "eth_blockNumber",
      [],
    );

    expect(channel).toBe("rpc:call");
    expect(envelope).toHaveProperty("error.message");
    expect(
      String((envelope as { error: { message: string } }).error.message),
    ).toMatch(/geth HTTP unreachable/);
  });
});
