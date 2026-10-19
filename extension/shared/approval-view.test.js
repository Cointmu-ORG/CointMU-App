import { describe, expect, it } from "vitest";
import {
  ValueKey,
  WarningKey,
  buildApprovalView,
  decodeMessage,
  formatWeiAsCmu,
  hasContractData,
} from "./approval-view.js";
import { SigningKind } from "./signing-request.js";

const ORIGIN = "https://dapp.example";
const ACCOUNT = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x3333333333333333333333333333333333333333";

describe("formatWeiAsCmu", () => {
  it.each([
    ["0xde0b6b3a7640000", "1"],
    ["1500000000000000000", "1.5"],
    ["0x1", "0.000000000000000001"],
    [undefined, "0"],
    ["0x0", "0"],
  ])("formats %j as %s", (value, expected) => {
    expect(formatWeiAsCmu(value)).toBe(expected);
  });

  it.each(["abc", "-1"])("returns null for %j", (value) => {
    expect(formatWeiAsCmu(value)).toBeNull();
  });
});

describe("hasContractData", () => {
  it.each([undefined, "", "0x", "0X"])("is false for %j", (data) => {
    expect(hasContractData(data)).toBe(false);
  });

  it("is true for calldata", () => {
    expect(hasContractData("0xa9059cbb")).toBe(true);
  });
});

describe("decodeMessage", () => {
  it("shows printable hex as text", () => {
    expect(decodeMessage({ message: "0x68656c6c6f", isHex: true })).toBe(
      "hello",
    );
  });

  it("keeps binary hex as hex", () => {
    expect(decodeMessage({ message: "0x00ff10", isHex: true })).toBe(
      "0x00ff10",
    );
  });

  it("returns plain text unchanged", () => {
    expect(decodeMessage({ message: "Sign in", isHex: false })).toBe("Sign in");
  });
});

describe("buildApprovalView", () => {
  it("describes a connection request", () => {
    const view = buildApprovalView({ origin: ORIGIN, request: null });
    expect(view.rows[0].value).toBe(ORIGIN);
    expect(view.rows[1].valueKey).toBe(ValueKey.ACCOUNTS);
    expect(view.warningKey).toBeNull();
  });

  it("shows recipient and value in CMU for a plain transfer", () => {
    const view = buildApprovalView({
      origin: ORIGIN,
      request: {
        kind: SigningKind.SEND_TRANSACTION,
        address: ACCOUNT,
        payload: { to: RECIPIENT, value: "0xde0b6b3a7640000" },
      },
    });
    const values = view.rows.map((row) => row.value);
    expect(values).toEqual([ORIGIN, ACCOUNT, RECIPIENT, "1 CMU"]);
    expect(view.warningKey).toBeNull();
  });

  it("warns about contract interaction and shows the data", () => {
    const view = buildApprovalView({
      origin: ORIGIN,
      request: {
        kind: SigningKind.SEND_TRANSACTION,
        address: ACCOUNT,
        payload: { to: RECIPIENT, data: "0xa9059cbb" },
      },
    });
    expect(view.warningKey).toBe(WarningKey.CONTRACT_DATA);
    expect(view.rows.at(-1)).toEqual(
      expect.objectContaining({ value: "0xa9059cbb", isData: true }),
    );
  });

  it("warns about contract creation", () => {
    const view = buildApprovalView({
      origin: ORIGIN,
      request: {
        kind: SigningKind.SIGN_TRANSACTION,
        address: ACCOUNT,
        payload: { data: "0x6080" },
      },
    });
    expect(view.warningKey).toBe(WarningKey.CONTRACT_DATA);
    expect(view.rows[2].valueKey).toBe(ValueKey.CONTRACT_CREATION);
  });

  it("shows typed data chain, type and message", () => {
    const view = buildApprovalView({
      origin: ORIGIN,
      request: {
        kind: SigningKind.TYPED_DATA,
        address: ACCOUNT,
        payload: {
          domain: { chainId: 1912 },
          types: {},
          primaryType: "Mail",
          message: { a: 1 },
        },
      },
    });
    expect(view.rows.slice(2).map((row) => row.value)).toEqual([
      "1912",
      "Mail",
      JSON.stringify({ a: 1 }, null, 2),
    ]);
  });
});
