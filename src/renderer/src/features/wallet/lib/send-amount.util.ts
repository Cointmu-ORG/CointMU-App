import { parseUnits } from "ethers";
import {
  NATIVE_ASSET_ADDRESS,
  type WalletAsset,
} from "../model/wallet-asset.types";

/** Why the amount cannot be sent; the send form maps each to a message. */
export const SendAmountError = {
  INVALID_AMOUNT: "invalidAmount",
  INSUFFICIENT_TOKEN: "insufficientToken",
  /** Native send: amount plus fee above the CMU balance. */
  INSUFFICIENT_TOTAL: "insufficientTotal",
  /** Token send: the token balance suffices but CMU cannot pay the fee. */
  INSUFFICIENT_GAS: "insufficientGas",
} as const;
export type SendAmountError =
  (typeof SendAmountError)[keyof typeof SendAmountError];

const isNativeAsset = (asset: WalletAsset): boolean =>
  asset.address === NATIVE_ASSET_ADDRESS;

/**
 * @param decimals - The asset's decimals.
 * @returns A pattern for amount input with at most that many fraction digits.
 */
export function amountInputPattern(decimals: number): RegExp {
  return decimals === 0 ? /^\d*$/ : new RegExp(`^\\d*\\.?\\d{0,${decimals}}$`);
}

/**
 * Parses typed text exactly, without floating point.
 * @param text - The amount as typed, e.g. "1.5".
 * @param decimals - The asset's decimals.
 * @returns The amount in the smallest unit, or null when not a positive amount.
 */
export function parseSendAmount(text: string, decimals: number): bigint | null {
  if (!amountInputPattern(decimals).test(text) || !/\d/.test(text)) return null;
  try {
    const amount = parseUnits(text.endsWith(".") ? text + "0" : text, decimals);
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
}

/**
 * @param asset - The asset being sent.
 * @param feeWei - The fee the send reserves (gas limit × gas price), in CMU wei.
 * @returns CMU: balance minus the fee (not below 0). Token: the whole balance.
 */
export function maxSendAmount(asset: WalletAsset, feeWei: bigint): bigint {
  if (!isNativeAsset(asset)) return asset.balance;
  return asset.balance > feeWei ? asset.balance - feeWei : 0n;
}

/** What validateSendAmount checks. */
export interface SendAmountCheck {
  readonly asset: WalletAsset;
  readonly amountText: string;
  readonly nativeBalance: bigint;
  readonly feeWei: bigint;
}

/**
 * Checks the amount against the balances; the fee is always paid in CMU.
 * @param check - The asset, typed amount, CMU balance and fee.
 * @returns The first problem, or null when the send can go ahead.
 */
export function validateSendAmount(
  check: SendAmountCheck,
): SendAmountError | null {
  const { asset, nativeBalance, feeWei } = check;
  const amount = parseSendAmount(check.amountText, asset.decimals);
  if (amount === null) return SendAmountError.INVALID_AMOUNT;
  if (amount > asset.balance) return SendAmountError.INSUFFICIENT_TOKEN;
  if (isNativeAsset(asset)) {
    return amount + feeWei > nativeBalance
      ? SendAmountError.INSUFFICIENT_TOTAL
      : null;
  }
  return feeWei > nativeBalance ? SendAmountError.INSUFFICIENT_GAS : null;
}
