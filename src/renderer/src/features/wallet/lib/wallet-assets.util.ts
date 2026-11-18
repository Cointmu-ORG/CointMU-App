import { formatUnits } from "ethers";
import type { DetectedToken } from "@bridge/types";
import type { TokenInfo } from "../api/token.service";
import {
  NATIVE_ASSET_ADDRESS,
  type WalletAsset,
} from "../model/wallet-asset.types";

/** Inputs of the merged asset list. */
export interface WalletAssetSources {
  readonly nativeBalance: bigint;
  /** Tokens added by address, with their balances. */
  readonly manual: ReadonlyArray<{ token: TokenInfo; balance: bigint }>;
  readonly detected: readonly DetectedToken[];
  /** Lowercase addresses the user hid. */
  readonly hidden: ReadonlySet<string>;
}

/**
 * Builds the token list: CMU first, then manual tokens (shown at any
 * balance), then detected tokens with a balance. Hidden tokens are left out
 * whatever their balance; a token both added and detected counts as manual.
 * @param sources - Balances, manual and detected tokens, hidden addresses.
 * @returns The assets in display order.
 */
export function mergeWalletAssets(sources: WalletAssetSources): WalletAsset[] {
  const native: WalletAsset = {
    address: NATIVE_ASSET_ADDRESS,
    name: "CointMU",
    symbol: "CMU",
    decimals: 18,
    balance: sources.nativeBalance,
    isAutoDetected: false,
  };
  const manual = sources.manual.map(({ token, balance }) => ({
    address: token.address.toLowerCase(),
    name: token.name,
    symbol: token.symbol,
    decimals: token.decimals,
    balance,
    isAutoDetected: false,
  }));
  const manualAddresses = new Set(manual.map((asset) => asset.address));
  const detected = sources.detected
    .filter((token) => !manualAddresses.has(token.address))
    .map((token) => ({
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      balance: BigInt(token.balance),
      isAutoDetected: true,
    }))
    .filter((asset) => asset.balance > 0n);
  return [
    native,
    ...[...manual, ...detected].filter(
      (asset) => !sources.hidden.has(asset.address),
    ),
  ];
}

/** @returns The assets the send picker offers: CMU and every token with a balance. */
export function sendableAssets(assets: readonly WalletAsset[]): WalletAsset[] {
  return assets.filter(
    (asset) => asset.address === NATIVE_ASSET_ADDRESS || asset.balance > 0n,
  );
}

/**
 * @param asset - A token or the native coin.
 * @returns Its symbol, or a short contract address when the contract gave none.
 */
export function assetLabel(
  asset: Pick<WalletAsset, "symbol" | "address">,
): string {
  return (
    asset.symbol || `${asset.address.slice(0, 6)}…${asset.address.slice(-4)}`
  );
}

const DISPLAY_FRACTION_DIGITS = 4;

/**
 * Formats a raw amount for display, cutting (never rounding up) extra
 * fraction digits and without going through floating point.
 * @param amount - In the asset's smallest unit.
 * @param decimals - The asset's decimals.
 * @param maxFractionDigits - Fraction digits kept.
 * @returns The amount, e.g. "1234.5" or "0.0001".
 */
export function formatAssetAmount(
  amount: bigint,
  decimals: number,
  maxFractionDigits = DISPLAY_FRACTION_DIGITS,
): string {
  const [whole, fraction = ""] = formatUnits(amount, decimals).split(".");
  const kept = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return kept ? `${whole}.${kept}` : whole;
}
