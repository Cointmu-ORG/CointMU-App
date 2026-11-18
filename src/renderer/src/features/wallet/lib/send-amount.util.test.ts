import { describe, expect, it } from "vitest";
import type { WalletAsset } from "../model/wallet-asset.types";
import {
  SendAmountError,
  maxSendAmount,
  parseSendAmount,
  validateSendAmount,
} from "./send-amount.util";

const CMU: WalletAsset = {
  address: "native",
  name: "CointMU",
  symbol: "CMU",
  decimals: 18,
  balance: 10n ** 18n,
  isAutoDetected: false,
};
const USD6: WalletAsset = {
  address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name: "Dollar",
  symbol: "USD",
  decimals: 6,
  balance: 1_500_000n,
  isAutoDetected: true,
};
const FEE = 21_000n * 10n ** 9n;

describe("parseSendAmount", () => {
  it("uses the token's decimals exactly", () => {
    expect(parseSendAmount("1.000001", 6)).toBe(1_000_001n);
    expect(parseSendAmount("0.1", 18)).toBe(10n ** 17n);
    expect(parseSendAmount("123456789.123456789123456789", 18)).toBe(
      123456789123456789123456789n,
    );
  });

  it("rejects more fraction digits than the token has, zero and junk", () => {
    expect(parseSendAmount("1.0000001", 6)).toBeNull();
    expect(parseSendAmount("0", 6)).toBeNull();
    expect(parseSendAmount(".", 6)).toBeNull();
    expect(parseSendAmount("1e3", 6)).toBeNull();
  });
});

describe("maxSendAmount", () => {
  it("leaves the fee for CMU and sends the whole token balance", () => {
    expect(maxSendAmount(CMU, FEE)).toBe(10n ** 18n - FEE);
    expect(maxSendAmount({ ...CMU, balance: FEE - 1n }, FEE)).toBe(0n);
    expect(maxSendAmount(USD6, FEE)).toBe(1_500_000n);
  });
});

describe("validateSendAmount", () => {
  it("accepts a token send whose fee the CMU balance covers", () => {
    expect(
      validateSendAmount({
        asset: USD6,
        amountText: "1.5",
        nativeBalance: FEE,
        feeWei: FEE,
      }),
    ).toBeNull();
  });

  it("refuses a token send when CMU cannot pay the gas, even with enough tokens", () => {
    expect(
      validateSendAmount({
        asset: USD6,
        amountText: "1",
        nativeBalance: FEE - 1n,
        feeWei: FEE,
      }),
    ).toBe(SendAmountError.INSUFFICIENT_GAS);
  });

  it("refuses more tokens than the balance", () => {
    expect(
      validateSendAmount({
        asset: USD6,
        amountText: "1.500001",
        nativeBalance: 10n ** 18n,
        feeWei: FEE,
      }),
    ).toBe(SendAmountError.INSUFFICIENT_TOKEN);
  });

  it("refuses a CMU send whose amount plus fee exceeds the balance", () => {
    const max = maxSendAmount(CMU, FEE);
    const check = { asset: CMU, nativeBalance: CMU.balance, feeWei: FEE };

    expect(
      validateSendAmount({ ...check, amountText: formatWei(max) }),
    ).toBeNull();
    expect(
      validateSendAmount({ ...check, amountText: formatWei(max + 1n) }),
    ).toBe(SendAmountError.INSUFFICIENT_TOTAL);
  });
});

function formatWei(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n).toString().padStart(18, "0");
  return `${whole}.${fraction}`;
}
