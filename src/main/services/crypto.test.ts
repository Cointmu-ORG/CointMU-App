import { describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { IpcErrorCode } from "../../bridge/types";
import { registerCryptoHandlers } from "./crypto";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

function registerHandlers(): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as Handler);
  });
  registerCryptoHandlers();
  return handlers;
}

describe("wallet:decrypt error codes", () => {
  const handlers = registerHandlers();
  const encrypt = handlers.get("wallet:encrypt") as Handler;
  const decrypt = handlers.get("wallet:decrypt") as Handler;

  it("rejects a wrong password with WALLET_INCORRECT_PASSWORD", async () => {
    const payload = await encrypt(null, "secret words", "right");

    await expect(decrypt(null, payload, "wrong")).rejects.toThrow(
      IpcErrorCode.WALLET_INCORRECT_PASSWORD,
    );
  });

  it("rejects unparsable data with WALLET_CORRUPT", async () => {
    await expect(decrypt(null, "{not json", "pw")).rejects.toThrow(
      IpcErrorCode.WALLET_CORRUPT,
    );
  });

  it("rejects an unknown version with WALLET_UNSUPPORTED_FORMAT", async () => {
    const payload = JSON.stringify({ v: 2, kdf: "scrypt" });

    await expect(decrypt(null, payload, "pw")).rejects.toThrow(
      IpcErrorCode.WALLET_UNSUPPORTED_FORMAT,
    );
  });

  it("still round-trips with the right password", async () => {
    const payload = await encrypt(null, "secret words", "right");

    await expect(decrypt(null, payload, "right")).resolves.toBe("secret words");
  });
});
