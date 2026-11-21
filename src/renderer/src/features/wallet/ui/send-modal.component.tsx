import { dispatchNotification } from "@/entities/notification";
import type { DerivedAccount } from "@/entities/account";
import { useAddressNameOf } from "@/entities/address-name";
import {
  GAS_ESTIMATION_DEBOUNCE_MS,
  GAS_BUFFER_MULTIPLIER,
  GAS_BUFFER_DIVISOR,
} from "../config/wallet.constants";
import { type JSX, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ethers } from "ethers";
import { useWalletAssets } from "../lib/wallet-assets.hook";
import {
  assetLabel,
  formatAssetAmount,
  sendableAssets,
} from "../lib/wallet-assets.util";
import {
  SendAmountError,
  amountInputPattern,
  maxSendAmount,
  validateSendAmount,
} from "../lib/send-amount.util";
import {
  NATIVE_ASSET_ADDRESS,
  type WalletAsset,
} from "../model/wallet-asset.types";
import { useWalletUiStore } from "../model/wallet-ui.store";
import { useAppStore, type PendingTransaction } from "@/shared/model";
import {
  resolveWallet,
  estimateNativeTransferGas,
  estimateErc20TransferGas,
  executeNativeTransfer,
  executeErc20Transfer,
  requireSessionPassword,
  parseTransferError,
} from "@/features/wallet";
import { call, getSetting, waitForTransactionReceipt } from "@/shared/api";
import { SendConfirmModal } from "./send-confirm-modal.component";
import type {
  SendConfirmResult,
  SendSummary,
} from "../model/send-confirm.types";
import { Check, AlertCircle } from "lucide-react";
import { CustomDropdown, PrivateAmount } from "@/shared/ui";
import { TokenIcon } from "@/features/wallet";

interface SendModalProps {
  activeAccount: DerivedAccount | undefined;
  activeWalletAddress: string | null;
  accounts: DerivedAccount[];
  onDone: () => void;
}

/** Gas of a plain CMU transfer, before the buffer; used by Max until an estimate exists. */
const NATIVE_TRANSFER_GAS = 21_000n;

/** @internal */
type EstimationStatus = "idle" | "estimating" | "ready" | "error";

/**
 * Formats a gas fee bigint (in wei) to a human-readable CMU string.
 * @param gasLimit - The estimated gas limit.
 * @param gasPriceHex - The current gas price as a hex string.
 * @returns A formatted string like '0.000042 CMU'.
 */
function formatGasFee(gasLimit: bigint, gasPriceHex: string): string {
  const feeWei = gasLimit * BigInt(gasPriceHex);
  return parseFloat(ethers.formatEther(feeWei)).toFixed(8);
}

/**
 * @returns The wallet's own label for the recipient, else its saved name.
 */
function nameRecipient(
  recipient: string,
  accounts: readonly DerivedAccount[],
  nameOf: (address: string) => string | undefined,
): string | undefined {
  const key = recipient.trim().toLowerCase();
  const own = accounts.find((a) => a.address.toLowerCase() === key);
  return own ? own.label : nameOf(key);
}

/**
 * Applies a 20% buffer to a gas estimate to reduce the risk of out-of-gas errors.
 * @param estimate - The raw gas estimate from the provider.
 * @returns The buffered gas limit as a bigint.
 */
function applyGasBuffer(estimate: bigint): bigint {
  return (estimate * GAS_BUFFER_MULTIPLIER) / GAS_BUFFER_DIVISOR;
}

/**
 * Full-featured send modal supporting native CMU and ERC-20 token transfers.
 * Manages its own gas estimation state via a debounced side-effect and performs
 * strict balance and fee validation before signing. The lifecycle phases are:
 * idle → estimating → ready → pending confirmation → success / error.
 * @param props - The active account, wallet address, account list, and done handler.
 * @returns The rendered send modal body.
 */
function SendModal({
  activeAccount,
  activeWalletAddress,
  accounts,
  onDone,
}: SendModalProps): JSX.Element {
  const { t } = useTranslation();
  const sendTo = useWalletUiStore((s) => s.sendTo);
  const sendAmount = useWalletUiStore((s) => s.sendAmount);
  const sendGasPrice = useWalletUiStore((s) => s.sendGasPrice);
  const sendSelectedTokenAddress = useWalletUiStore(
    (s) => s.sendSelectedTokenAddress,
  );
  const sendLoading = useWalletUiStore((s) => s.sendLoading);
  const sendSuccess = useWalletUiStore((s) => s.sendSuccess);
  const setSendTo = useWalletUiStore((s) => s.setSendTo);
  const setSendAmount = useWalletUiStore((s) => s.setSendAmount);
  const setSendSelectedTokenAddress = useWalletUiStore(
    (s) => s.setSendSelectedTokenAddress,
  );
  const setSendLoading = useWalletUiStore((s) => s.setSendLoading);
  const setSendSuccess = useWalletUiStore((s) => s.setSendSuccess);
  const resetSendForm = useWalletUiStore((s) => s.resetSendForm);
  const addPendingTransaction = useAppStore((s) => s.addPendingTransaction);
  const removePendingTransaction = useAppStore(
    (s) => s.removePendingTransaction,
  );
  const fetchGlobalStats = useAppStore((s) => s.fetchGlobalStats);
  // A label only: the send below still goes to the address typed in.
  const nameOf = useAddressNameOf();
  const recipientName = nameRecipient(sendTo, accounts, nameOf);

  const { assets } = useWalletAssets(activeWalletAddress);
  // Settings → Security; on (the default) until the stored value says off.
  const [isPasswordRequired, setIsPasswordRequired] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getSetting<boolean | undefined>("security.confirmPasswordOnSend")
      .then((stored) => {
        if (isMounted) setIsPasswordRequired(stored !== false);
      })
      .catch((err: unknown) => {
        console.error("Failed to read the send password setting", err);
      });
    return () => {
      isMounted = false;
    };
  }, []);
  const [gasLimit, setGasLimit] = useState<bigint | null>(null);
  const [estimationStatus, setEstimationStatus] =
    useState<EstimationStatus>("idle");

  const options = sendableAssets(assets);
  const selectedToken: WalletAsset | null =
    options.find((a) => a.address === sendSelectedTokenAddress) ??
    options[0] ??
    null;
  const nativeBalance =
    assets.find((a) => a.address === NATIVE_ASSET_ADDRESS)?.balance ?? 0n;
  const isNative = selectedToken?.address === NATIVE_ASSET_ADDRESS;
  const feeWei =
    gasLimit && sendGasPrice ? gasLimit * BigInt(sendGasPrice) : null;
  const gasFeeFormatted =
    gasLimit && sendGasPrice ? formatGasFee(gasLimit, sendGasPrice) : null;

  const runEstimation = useCallback(async () => {
    if (!sendTo || !sendAmount || !activeWalletAddress || !selectedToken) {
      setGasLimit(null);
      setEstimationStatus("idle");
      return;
    }

    if (!ethers.isAddress(sendTo)) {
      setGasLimit(null);
      setEstimationStatus("idle");
      return;
    }

    if (
      validateSendAmount({
        asset: selectedToken,
        amountText: sendAmount,
        nativeBalance,
        feeWei: 0n,
      }) === SendAmountError.INVALID_AMOUNT
    ) {
      setGasLimit(null);
      setEstimationStatus("idle");
      return;
    }

    setEstimationStatus("estimating");

    try {
      let raw: bigint;

      if (isNative) {
        raw = await estimateNativeTransferGas(
          activeWalletAddress,
          sendTo,
          ethers.parseEther(sendAmount),
        );
      } else {
        raw = await estimateErc20TransferGas(
          selectedToken.address,
          activeWalletAddress,
          sendTo,
          sendAmount,
          selectedToken.decimals,
        );
      }

      setGasLimit(applyGasBuffer(raw));
      setEstimationStatus("ready");
    } catch {
      setGasLimit(null);
      setEstimationStatus("error");
    }
  }, [
    sendTo,
    sendAmount,
    activeWalletAddress,
    selectedToken,
    isNative,
    nativeBalance,
  ]);

  useEffect(() => {
    const timer = setTimeout(runEstimation, GAS_ESTIMATION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [runEstimation]);

  const handleTokenSelect = (token: WalletAsset): void => {
    setSendSelectedTokenAddress(token.address);
    setSendAmount("");
    setGasLimit(null);
    setEstimationStatus("idle");
  };

  /**
   * Accepts digits with at most the asset's decimals as fraction digits.
   * @param value - The raw string from the amount field.
   */
  const handleAmountChange = (value: string): void => {
    if (!selectedToken) return;
    if (!amountInputPattern(selectedToken.decimals).test(value)) return;
    setSendAmount(value);
  };

  /**
   * Fills in the whole balance: for CMU minus the fee the send reserves
   * (gas limit × gas price), for a token all of it (the fee is paid in CMU).
   */
  const handleMaxAmount = (): void => {
    if (!selectedToken || !sendGasPrice) return;
    const reservedGas = isNative
      ? (gasLimit ?? applyGasBuffer(NATIVE_TRANSFER_GAS))
      : 0n;
    const max = maxSendAmount(
      selectedToken,
      reservedGas * BigInt(sendGasPrice),
    );
    setSendAmount(
      ethers.formatUnits(max, selectedToken.decimals).replace(/\.0$/, ""),
    );
  };

  const validateBeforeSend = (): string | null => {
    if (!sendTo) return t("wallet:modals.send.errorRecipientReq");
    if (!ethers.isAddress(sendTo))
      return t("wallet:modals.send.errorInvalidAddress");
    if (!selectedToken) return t("wallet:modals.send.errorValidAmount");
    const check = {
      asset: selectedToken,
      amountText: sendAmount,
      nativeBalance,
      feeWei: feeWei ?? 0n,
    };
    if (validateSendAmount(check) === SendAmountError.INVALID_AMOUNT)
      return t("wallet:modals.send.errorValidAmount");
    if (feeWei === null) return t("wallet:modals.send.errorGasPending");

    switch (validateSendAmount(check)) {
      case SendAmountError.INSUFFICIENT_TOKEN:
        return t("wallet:modals.send.errorInsufficientToken", {
          symbol: assetLabel(selectedToken),
        });
      case SendAmountError.INSUFFICIENT_TOTAL:
        return t("wallet:modals.send.errorInsufficientTotal", {
          amount: sendAmount,
          fee: gasFeeFormatted,
        });
      case SendAmountError.INSUFFICIENT_GAS:
        return t("wallet:modals.send.errorInsufficientGas", {
          fee: gasFeeFormatted,
        });
      default:
        return null;
    }
  };

  const formError = validateBeforeSend();
  const canContinue =
    formError === null && estimationStatus === "ready" && !sendLoading;
  // Only explain a blocked "Continue" once there is something to judge.
  const formHint =
    sendTo && sendAmount && estimationStatus !== "estimating"
      ? formError
      : null;

  const handleConfirm = async (
    password: string,
  ): Promise<SendConfirmResult> => {
    if (sendLoading || !activeAccount || !activeWalletAddress || !selectedToken)
      return {
        isOk: false,
        field: "general",
        message: t("wallet:errors.unexpected"),
      };

    const validationError = validateBeforeSend();
    if (validationError) {
      return { isOk: false, field: "general", message: validationError };
    }

    setSendLoading(true);

    let wallet: Awaited<ReturnType<typeof resolveWallet>>;
    try {
      // With the setting on, the typed password decrypts the key itself, so a
      // wrong one fails here, locally, before anything is signed.
      wallet = await resolveWallet(
        activeAccount,
        isPasswordRequired ? password : requireSessionPassword(),
      );
    } catch (e) {
      setSendLoading(false);
      return {
        isOk: false,
        field: isPasswordRequired ? "password" : "general",
        message: parseTransferError(e),
      };
    }

    try {
      const nonceHex = await call("eth_getTransactionCount", [
        activeWalletAddress,
        "latest",
      ]);
      const chainIdHex = await call("eth_chainId", []);
      const nonce = parseInt(nonceHex, 16);
      const chainId = parseInt(chainIdHex, 16);
      const gasPriceToUse = sendGasPrice || "0";

      let txHash: string;
      let pendingEntry: PendingTransaction;

      if (isNative) {
        txHash = await executeNativeTransfer(
          wallet,
          sendTo,
          sendAmount,
          gasLimit!,
          gasPriceToUse,
          nonce,
          chainId,
        );
        pendingEntry = {
          hash: txHash,
          from: activeWalletAddress,
          to: sendTo,
          amount: parseFloat(sendAmount),
          timestamp: Date.now(),
          gas: parseFloat(gasFeeFormatted ?? "0"),
        };
      } else {
        txHash = await executeErc20Transfer(
          wallet,
          selectedToken.address,
          sendTo,
          sendAmount,
          selectedToken.decimals,
          gasLimit!,
          gasPriceToUse,
          nonce,
          chainId,
        );
        pendingEntry = {
          hash: txHash,
          from: activeWalletAddress,
          to: sendTo,
          amount: parseFloat(sendAmount),
          token: {
            address: selectedToken.address,
            symbol: assetLabel(selectedToken),
          },
          timestamp: Date.now(),
          gas: parseFloat(gasFeeFormatted ?? "0"),
        };
      }

      addPendingTransaction(pendingEntry);
      setSendSuccess(txHash);

      const addresses = accounts.map((a) => a.address);
      void fetchGlobalStats(activeWalletAddress, addresses);

      const shortTo = `${sendTo.slice(0, 6)}...${sendTo.slice(-4)}`;
      const sentLabel = `${sendAmount} ${assetLabel(selectedToken)}`;

      void waitForTransactionReceipt(txHash, { confirmations: 1 })
        .then(() => {
          removePendingTransaction(txHash);
          dispatchNotification(
            "transaction",
            t("wallet:modals.send.notifConfirmedTitle"),
            t("wallet:modals.send.notifConfirmedDesc", {
              asset: sentLabel,
              to: shortTo,
            }),
            { hash: txHash },
          );
          return fetchGlobalStats(activeWalletAddress, addresses);
        })
        .catch(() => {
          removePendingTransaction(txHash);
          dispatchNotification(
            "transaction",
            t("wallet:modals.send.notifFailedTitle"),
            t("wallet:modals.send.notifFailedDesc", {
              asset: sentLabel,
              to: shortTo,
            }),
            { hash: txHash },
          );
          return fetchGlobalStats(activeWalletAddress, addresses);
        });
      return { isOk: true };
    } catch (e) {
      return { isOk: false, field: "general", message: parseTransferError(e) };
    } finally {
      setSendLoading(false);
    }
  };

  const summary: SendSummary | null =
    activeAccount && gasFeeFormatted
      ? {
          fromLabel: activeAccount.label,
          fromAddress: activeAccount.address,
          toAddress: sendTo,
          toName: recipientName,
          amount: sendAmount,
          symbol: selectedToken ? assetLabel(selectedToken) : "CMU",
          tokenAddress: selectedToken?.address ?? NATIVE_ASSET_ADDRESS,
          feeCmu: gasFeeFormatted,
          isNative,
        }
      : null;

  const handleBack = useCallback(() => setIsConfirming(false), []);

  const handleDone = (): void => {
    resetSendForm();
    onDone();
  };

  if (sendSuccess) {
    return (
      <div className="p-8">
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check width={32} height={32} strokeWidth={3} />
          </div>
          <p className="text-lg font-bold text-slate-800 dark:text-gray-100 mb-2">
            {t("wallet:modals.send.successTitle")}
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">
            {t("wallet:modals.send.txHash")}
          </p>
          <p className="text-xs font-mono text-slate-700 dark:text-gray-200 break-all bg-slate-50 dark:bg-gray-950 border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2 mb-6">
            {sendSuccess}
          </p>
          <button
            onClick={handleDone}
            className="w-full py-3.5 bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors"
          >
            {t("wallet:modals.send.doneBtn")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-1">
        {t("wallet:modals.send.title")}
      </h3>
      <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">
        {t("wallet:modals.send.subtitle")}
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-gray-200 mb-2">
            {t("wallet:modals.send.assetLabel")}
          </label>
          <div className="relative">
            <CustomDropdown<WalletAsset>
              options={options}
              selected={selectedToken}
              onSelect={handleTokenSelect}
              disabled={sendLoading}
              getSearchLabel={(option) => `${option.symbol} ${option.name}`}
              renderSelected={(selected) => (
                <>
                  <TokenIcon
                    address={selected?.address ?? NATIVE_ASSET_ADDRESS}
                    symbol={selected?.symbol ?? ""}
                    size="sm"
                  />
                  <span className="truncate">
                    {selected
                      ? assetLabel(selected)
                      : t("wallet:modals.send.selectToken")}
                  </span>
                  {selected && (
                    <span className="text-slate-400 dark:text-gray-400 font-normal truncate">
                      {selected.name}
                    </span>
                  )}
                </>
              )}
              renderOption={(option) => (
                <>
                  <TokenIcon
                    address={option.address}
                    symbol={option.symbol}
                    size="sm"
                  />
                  <span className="truncate">{assetLabel(option)}</span>
                  <span className="ml-auto pl-3 font-mono text-xs text-slate-500 dark:text-gray-400 whitespace-nowrap">
                    <PrivateAmount>
                      {formatAssetAmount(option.balance, option.decimals)}
                    </PrivateAmount>
                  </span>
                </>
              )}
            />
          </div>

          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-xs text-slate-400 dark:text-gray-400">
              {t("wallet:modals.send.availableBalance")}
            </span>
            <span className="text-xs font-mono font-semibold text-slate-600 dark:text-gray-300">
              <PrivateAmount>
                {selectedToken
                  ? formatAssetAmount(
                      selectedToken.balance,
                      selectedToken.decimals,
                    )
                  : "..."}
              </PrivateAmount>{" "}
              {selectedToken ? assetLabel(selectedToken) : ""}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-gray-200 mb-2">
            {t("wallet:modals.send.recipientLabel")}
          </label>
          <input
            type="text"
            value={sendTo}
            onChange={(e) => setSendTo(e.target.value)}
            disabled={sendLoading}
            placeholder="0x..."
            className="w-full px-4 py-3 bg-slate-50 dark:bg-gray-950 border border-slate-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent focus:bg-white dark:focus:bg-gray-900 dark:text-white transition-all font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {recipientName !== undefined && (
            <p className="mt-1.5 text-xs font-semibold text-slate-500 dark:text-gray-400 truncate">
              {t("wallet:modals.send.recipientName", { name: recipientName })}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-700 dark:text-gray-200">
              {t("wallet:modals.send.amountLabel")}
            </label>
            <button
              type="button"
              onClick={handleMaxAmount}
              disabled={sendLoading || !selectedToken}
              className="text-xs font-bold text-accent hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t("wallet:modals.send.maxBtn")}
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={sendAmount}
              onChange={(e) => handleAmountChange(e.target.value)}
              disabled={sendLoading}
              placeholder="0.00"
              className="w-full pl-4 pr-20 py-3 bg-slate-50 dark:bg-gray-950 border border-slate-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent focus:bg-white dark:focus:bg-gray-900 dark:text-white transition-all font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="absolute right-4 top-3.5 text-sm font-bold text-slate-400">
              {selectedToken ? assetLabel(selectedToken) : "CMU"}
            </span>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-gray-950 border border-slate-100 dark:border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-500 dark:text-gray-400">
              {t("wallet:modals.send.networkFee")}
            </span>
            <span className="text-xs font-mono font-bold text-slate-700 dark:text-gray-200">
              {estimationStatus === "estimating" && (
                <span className="text-slate-400 animate-pulse">
                  {t("wallet:modals.send.estimating")}
                </span>
              )}
              {estimationStatus === "ready" && gasFeeFormatted && (
                <span>{gasFeeFormatted} CMU</span>
              )}
              {estimationStatus === "error" && (
                <span className="text-amber-500">
                  {t("wallet:modals.send.couldNotEstimate")}
                </span>
              )}
              {estimationStatus === "idle" && (
                <span className="text-slate-400">—</span>
              )}
            </span>
          </div>

          {!isNative && (
            <>
              <div className="h-px bg-slate-200 dark:bg-gray-800" />
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-500 dark:text-gray-400">
                  {t("wallet:modals.send.cmuGasBalance")}
                </span>
                <span className="text-xs font-mono font-bold text-slate-700 dark:text-gray-200">
                  <PrivateAmount>
                    {formatAssetAmount(nativeBalance, 18)}
                  </PrivateAmount>{" "}
                  CMU
                </span>
              </div>
            </>
          )}

          {isNative &&
            sendAmount &&
            gasFeeFormatted &&
            estimationStatus === "ready" && (
              <>
                <div className="h-px bg-slate-200 dark:bg-gray-800" />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800 dark:text-gray-100">
                    {t("wallet:modals.send.totalDeducted")}
                  </span>
                  <span className="text-sm font-mono font-bold text-slate-800 dark:text-gray-100">
                    {(
                      parseFloat(sendAmount) + parseFloat(gasFeeFormatted)
                    ).toFixed(6)}{" "}
                    CMU
                  </span>
                </div>
              </>
            )}
        </div>

        {formHint && (
          <div className="flex items-start gap-2 text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 rounded-xl border border-red-100 dark:border-red-900/50">
            <AlertCircle
              width={14}
              height={14}
              className="flex-shrink-0 mt-0.5"
            />
            <p className="text-xs font-medium leading-relaxed">{formHint}</p>
          </div>
        )}

        <button
          onClick={() => setIsConfirming(true)}
          disabled={!canContinue}
          className="w-full py-3.5 bg-accent text-white font-bold rounded-xl shadow-sm shadow-accent/20 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
        >
          {t("wallet:modals.send.continueBtn")}
        </button>
      </div>

      {isConfirming && summary && (
        <SendConfirmModal
          summary={summary}
          isPasswordRequired={isPasswordRequired}
          onBack={handleBack}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

export { SendModal };
export type { SendModalProps };
