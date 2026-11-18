import { describe, expect, it } from "vitest";
import type { DetectedToken } from "@bridge/types";
import {
  formatAssetAmount,
  mergeWalletAssets,
  sendableAssets,
} from "./wallet-assets.util";

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const detected = (address: string, balance: string): DetectedToken => ({
  address,
  name: "Token",
  symbol: "TKN",
  decimals: 6,
  balance,
});
const manualToken = {
  address: B.toUpperCase().replace("0X", "0x"),
  name: "Manual",
  symbol: "MAN",
  decimals: 18,
  price: "N/A",
  change: "",
};

describe("mergeWalletAssets", () => {
  it("lists CMU first, then manual tokens, then detected tokens with a balance", () => {
    const assets = mergeWalletAssets({
      nativeBalance: 5n,
      manual: [{ token: manualToken, balance: 0n }],
      detected: [detected(A, "10"), detected(B, "3")],
      hidden: new Set(),
    });

    expect(assets.map((a) => [a.address, a.isAutoDetected])).toEqual([
      ["native", false],
      [B, false],
      [A, true],
    ]);
  });

  it("leaves out detected tokens with a zero balance", () => {
    const assets = mergeWalletAssets({
      nativeBalance: 0n,
      manual: [],
      detected: [detected(A, "0")],
      hidden: new Set(),
    });

    expect(assets.map((a) => a.address)).toEqual(["native"]);
  });

  it("keeps a hidden token hidden even when its balance grows", () => {
    const assets = mergeWalletAssets({
      nativeBalance: 0n,
      manual: [],
      detected: [detected(A, "999999999")],
      hidden: new Set([A]),
    });

    expect(assets.map((a) => a.address)).toEqual(["native"]);
  });
});

describe("sendableAssets", () => {
  it("offers CMU at any balance and tokens only with a balance", () => {
    const assets = mergeWalletAssets({
      nativeBalance: 0n,
      manual: [{ token: manualToken, balance: 0n }],
      detected: [detected(A, "1")],
      hidden: new Set(),
    });

    expect(sendableAssets(assets).map((a) => a.address)).toEqual(["native", A]);
  });
});

describe("formatAssetAmount", () => {
  it("cuts extra fraction digits without rounding or float error", () => {
    expect(formatAssetAmount(123456789n, 6)).toBe("123.4567");
    expect(formatAssetAmount(10n ** 30n + 1n, 18)).toBe("1000000000000");
    expect(formatAssetAmount(0n, 18)).toBe("0");
  });
});
