import { describe, expect, it, vi } from "vitest";
import { findIpcErrorCode, localizeIpcError } from "./ipc-error.util";

vi.mock("i18next", () => ({ default: { t: (key: string) => `t:${key}` } }));

// Electron 44 ipcRenderer.invoke rejects with
// `Error invoking remote method '${channel}': ${String(mainError)}`.
const ELECTRON_DECRYPT_ERROR = new Error(
  "Error invoking remote method 'wallet:decrypt': Error: WALLET_INCORRECT_PASSWORD",
);
const ELECTRON_TOGGLE_ERROR = new Error(
  "Error invoking remote method 'mining:toggle': Error: MINING_NO_REWARD_ADDRESS",
);
const ELECTRON_UNKNOWN_ERROR = new Error(
  "Error invoking remote method 'mining:toggle': Error: geth HTTP unreachable: ECONNREFUSED",
);

describe("findIpcErrorCode", () => {
  it("finds the code inside Electron's invoke wrapper", () => {
    expect(findIpcErrorCode(ELECTRON_DECRYPT_ERROR)).toBe(
      "WALLET_INCORRECT_PASSWORD",
    );
    expect(findIpcErrorCode(ELECTRON_TOGGLE_ERROR)).toBe(
      "MINING_NO_REWARD_ADDRESS",
    );
  });

  it("finds a bare code thrown without the wrapper", () => {
    expect(findIpcErrorCode(new Error("WALLET_CORRUPT"))).toBe(
      "WALLET_CORRUPT",
    );
  });

  it("returns null for unknown messages and non-errors", () => {
    expect(findIpcErrorCode(ELECTRON_UNKNOWN_ERROR)).toBeNull();
    expect(findIpcErrorCode("WALLET_CORRUPT")).toBeNull();
    expect(findIpcErrorCode(undefined)).toBeNull();
  });
});

describe("localizeIpcError", () => {
  it("maps a known code to its common:errors key", () => {
    expect(localizeIpcError(ELECTRON_DECRYPT_ERROR, "x:fallback")).toBe(
      "t:common:errors.WALLET_INCORRECT_PASSWORD",
    );
  });

  it("uses the fallback key for an unknown code", () => {
    expect(localizeIpcError(ELECTRON_UNKNOWN_ERROR, "mining:fallback")).toBe(
      "t:mining:fallback",
    );
  });
});
