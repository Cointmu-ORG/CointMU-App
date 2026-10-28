import type { DerivedAccount } from "@/entities/account";
import {
  GAS_ESTIMATION_DEBOUNCE_MS,
  GAS_BUFFER_MULTIPLIER,
  GAS_BUFFER_DIVISOR,
} from "../config/wallet.constants";
import { type JSX, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ethers } from "ethers";
import { useWalletUiStore } from "../model/wallet-ui.store";
import { useAppStore, type PendingTransaction } from "@/shared/model";
import {
  TokenService,
  getTokenBalance,
  type TokenInfo,
} from "@/features/wallet";
import {
  resolveWallet,
  estimateNativeTransferGas,
  estimateErc20TransferGas,
  executeNativeTransfer,
  executeErc20Transfer,
  requireSessionPassword,
  parseTransferError,
} from "@/features/wallet";
import { call, waitForTransactionReceipt } from "@/shared/api";
import { dispatchNotification } from "@/features/notifications";
import { Check, AlertCircle } from "lucide-react";
import { CustomDropdown } from "@/shared/ui";
import { TokenIcon } from "@/features/wallet";

interface SendModalProps {
  activeAccount: DerivedAccount | undefined;
  activeWalletAddress: string | null;
  accounts: DerivedAccount[];
  onDone: () => void;
}

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
 * Applies a 20% buffer to a gas estimate to reduce the risk of out-of-gas errors.
 * @param estimate - The raw gas estimate from the provider.
 * @returns The buffered gas limit as a bigint.
 */
function applyGasBuffer(estimate: bigint): bigint {
  return (estimate * GAS_BUFFER_MULTIPLIER) / GAS_BUFFER_DIVISOR;
}

/**
 * Parses and validates a numeric input string for token amounts.
 * @param value - The raw string from the input element.
 * @returns True when the value is a valid non-negative number string.
 */
function isValidAmountInput(value: string): boolean {
  if (value === "" || value === ".") return true;
  return (
    /^\d*\.?\d*$/.test(value) &&
    !isNaN(parseFloat(value)) &&
    parseFloat(value) >= 0
  );
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
  const sendError = useWalletUiStore((s) => s.sendError);
  const sendSuccess = useWalletUiStore((s) => s.sendSuccess);
  const setSendTo = useWalletUiStore((s) => s.setSendTo);
  const setSendAmount = useWalletUiStore((s) => s.setSendAmount);
  const setSendSelectedTokenAddress = useWalletUiStore(
    (s) => s.setSendSelectedTokenAddress,
  );
  const setSendLoading = useWalletUiStore((s) => s.setSendLoading);
  const setSendError = useWalletUiStore((s) => s.setSendError);
  const setSendSuccess = useWalletUiStore((s) => s.setSendSuccess);
  const resetSendForm = useWalletUiStore((s) => s.resetSendForm);
  const addPendingTransaction = useAppStore((s) => s.addPendingTransaction);
  const removePendingTransaction = useAppStore(
    (s) => s.removePendingTransaction,
  );
  const fetchGlobalStats = useAppStore((s) => s.fetchGlobalStats);

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [tokenBalance, setTokenBalance] = useState<string>("...");
  const [nativeBalance, setNativeBalance] = useState<string>("0");
  const [gasLimit, setGasLimit] = useState<bigint | null>(null);
  const [estimationStatus, setEstimationStatus] =
    useState<EstimationStatus>("idle");

  const isNative = sendSelectedTokenAddress === "native";
  const gasFeeFormatted =
    gasLimit && sendGasPrice ? formatGasFee(gasLimit, sendGasPrice) : null;

  useEffect(() => {
    const loaded = TokenService.getTokens();
    setTokens(loaded);
    const initial =
      loaded.find((t) => t.address === sendSelectedTokenAddress) ?? loaded[0];
    setSelectedToken(initial);
  }, []);

  useEffect(() => {
    if (!activeWalletAddress || !selectedToken) return;

    setTokenBalance("...");

    getTokenBalance(activeWalletAddress, selectedToken.address).then((bal) => {
      setTokenBalance(bal);
    });

    if (!isNative && activeWalletAddress) {
      getTokenBalance(activeWalletAddress, "native").then((bal) => {
        setNativeBalance(bal);
      });
    }
  }, [selectedToken, activeWalletAddress, isNative]);

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

    const parsedAmount = parseFloat(sendAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
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
  }, [sendTo, sendAmount, activeWalletAddress, selectedToken, isNative]);

  useEffect(() => {
    const timer = setTimeout(runEstimation, GAS_ESTIMATION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [runEstimation]);

  const handleTokenSelect = (token: TokenInfo): void => {
    setSelectedToken(token);
    setSendSelectedTokenAddress(token.address);
    setSendAmount("");
    setGasLimit(null);
    setEstimationStatus("idle");
  };

  /**
   * Handles the amount input change event.
   * Restricts the input to a maximum of 5 decimal places and auto-corrects to balance minus 1 CMU reserve.
   * @param value - The raw input string from the amount field.
   */
  const handleAmountChange = (value: string): void => {
    if (!/^\d*\.?\d{0,5}$/.test(value)) return;
    if (!isValidAmountInput(value)) return;

    if (tokenBalance !== "...") {
      const parsedAmount = parseFloat(value);
      const balanceNum = parseFloat(tokenBalance.replace(/,/g, ""));

      if (
        !isNaN(parsedAmount) &&
        !isNaN(balanceNum) &&
        parsedAmount > balanceNum
      ) {
        const safeMax = isNative ? Math.max(0, balanceNum - 1) : balanceNum;
        const safeMaxTruncated = Math.floor(safeMax * 100000) / 100000;
        setSendAmount(safeMaxTruncated.toString());
        return;
      }
    }

    setSendAmount(value);
  };

  /**
   * Populates the amount input with the maximum available balance, reserving 1 CMU for native transfers.
   */
  const handleMaxAmount = (): void => {
    if (tokenBalance === "...") return;
    const balanceNum = parseFloat(tokenBalance.replace(/,/g, ""));
    if (isNaN(balanceNum)) return;

    const safeMax = isNative ? Math.max(0, balanceNum - 1) : balanceNum;
    const safeMaxTruncated = Math.floor(safeMax * 100000) / 100000;
    setSendAmount(safeMaxTruncated.toString());
  };

  const validateBeforeSend = (): string | null => {
    if (!sendTo) return t("wallet:modals.send.errorRecipientReq");
    if (!ethers.isAddress(sendTo))
      return t("wallet:modals.send.errorInvalidAddress");
    if (!sendAmount || parseFloat(sendAmount) <= 0)
      return t("wallet:modals.send.errorValidAmount");
    if (!gasLimit || !sendGasPrice)
      return t("wallet:modals.send.errorGasPending");

    const amountNum = parseFloat(sendAmount);
    const balanceNum = parseFloat(tokenBalance.replace(/,/g, ""));

    if (amountNum > balanceNum) {
      return t("wallet:modals.send.errorInsufficientToken", {
        symbol: selectedToken?.symbol ?? "",
      });
    }

    const gasFeeEth = parseFloat(gasFeeFormatted ?? "0");

    if (isNative) {
      const totalRequired = amountNum + gasFeeEth;
      if (totalRequired > balanceNum) {
        return t("wallet:modals.send.errorInsufficientTotal", {
          amount: sendAmount,
          fee: gasFeeFormatted,
        });
      }
    } else {
      const nativeBalanceNum = parseFloat(nativeBalance.replace(/,/g, ""));
      if (gasFeeEth > nativeBalanceNum) {
        return t("wallet:modals.send.errorInsufficientGas", {
          fee: gasFeeFormatted,
        });
      }
    }

    return null;
  };

  const handleSend = async (): Promise<void> => {
    if (sendLoading || !activeAccount || !activeWalletAddress || !selectedToken)
      return;

    const validationError = validateBeforeSend();
    if (validationError) {
      setSendError(validationError);
      return;
    }

    setSendError("");
    setSendLoading(true);

    try {
      const password = requireSessionPassword();
      const wallet = await resolveWallet(activeAccount, password);

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
          amount: 0,
          timestamp: Date.now(),
          gas: parseFloat(gasFeeFormatted ?? "0"),
        };
      }

      addPendingTransaction(pendingEntry);
      setSendSuccess(txHash);

      const addresses = accounts.map((a) => a.address);
      void fetchGlobalStats(activeWalletAddress, addresses);

      const shortTo = `${sendTo.slice(0, 6)}...${sendTo.slice(-4)}`;
      const assetLabel = isNative
        ? `${sendAmount} CMU`
        : `${sendAmount} ${selectedToken.symbol}`;

      void waitForTransactionReceipt(txHash, { confirmations: 1 })
        .then(() => {
          removePendingTransaction(txHash);
          dispatchNotification(
            "transaction",
            t("wallet:modals.send.notifConfirmedTitle"),
            t("wallet:modals.send.notifConfirmedDesc", {
              asset: assetLabel,
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
              asset: assetLabel,
              to: shortTo,
            }),
            { hash: txHash },
          );
          return fetchGlobalStats(activeWalletAddress, addresses);
        });
    } catch (e) {
      setSendError(parseTransferError(e));
    } finally {
      setSendLoading(false);
    }
  };

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
            <CustomDropdown<TokenInfo>
              options={tokens}
              selected={selectedToken}
              onSelect={handleTokenSelect}
              disabled={sendLoading}
              renderSelected={(selected) => (
                <>
                  <TokenIcon
                    address={selected?.address ?? "native"}
                    symbol={selected?.symbol ?? ""}
                    size="sm"
                  />
                  <span>
                    {selected?.name ?? t("wallet:modals.send.selectToken")}
                  </span>
                  <span className="text-slate-400 dark:text-gray-400 font-normal">
                    ({selected?.symbol})
                  </span>
                </>
              )}
              renderOption={(option) => (
                <>
                  <TokenIcon
                    address={option.address}
                    symbol={option.symbol}
                    size="sm"
                  />
                  <span>{option.name}</span>
                  <span className="text-slate-400 dark:text-gray-400 font-normal ml-1">
                    ({option.symbol})
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
              {tokenBalance} {selectedToken?.symbol}
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
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-700 dark:text-gray-200">
              {t("wallet:modals.send.amountLabel")}
            </label>
            <button
              type="button"
              onClick={handleMaxAmount}
              disabled={sendLoading || tokenBalance === "..."}
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
              {selectedToken?.symbol ?? "CMU"}
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
                  {nativeBalance} CMU
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

        {sendError && (
          <div className="flex items-start gap-2 text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 rounded-xl border border-red-100 dark:border-red-900/50">
            <AlertCircle
              width={14}
              height={14}
              className="flex-shrink-0 mt-0.5"
            />
            <p className="text-xs font-medium leading-relaxed">{sendError}</p>
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sendLoading || estimationStatus === "estimating"}
          className="w-full py-3.5 bg-accent text-white font-bold rounded-xl shadow-sm shadow-accent/20 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
        >
          {sendLoading
            ? t("wallet:modals.send.pendingConf")
            : t("wallet:modals.send.reviewSign")}
        </button>
      </div>
    </div>
  );
}

export { SendModal };
export type { SendModalProps };
