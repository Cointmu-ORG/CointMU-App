import { MOCK_USD_RATE } from "../config/explorer.constants";
import { useState, useEffect, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Check, AlertCircle } from "lucide-react";
import {
  getTransactionDetail,
  type TransactionDetailData,
} from "../api/explorer.service";
import { useAppStore } from "@/shared/model";
import { AddressBadge } from "./address-badge.component";
import { formatDateTime } from "@/shared/lib";

interface TransactionDetailProps {
  tx: { hash: string };
  onBack: () => void;
  onBlockSelect: (blockNumber: number) => void;
  onAddressSelect: (address: string) => void;
}

/**
 * Detailed transaction view presenting the hash, receipt-derived status and
 * confirmations, containing block, timestamp, participants, value, gas
 * accounting, fee, nonce, and input data. The receipt and block are fetched on
 * mount so status and actual gas used reflect on-chain execution.
 * @param props - The selected transaction hash and the navigation handlers.
 * @returns The rendered transaction detail view.
 */
function TransactionDetail({
  tx,
  onBack,
  onBlockSelect,
  onAddressSelect,
}: TransactionDetailProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const blockHeight = useAppStore((s) => s.blockHeight);
  const [detail, setDetail] = useState<TransactionDetailData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getTransactionDetail(tx.hash).then((result) => {
      if (mounted) {
        setDetail(result);
        setLoading(false);
      }
    });
    return (): void => {
      mounted = false;
    };
  }, [tx.hash]);

  const confirmations =
    detail && detail.blockNumber !== null && blockHeight !== null
      ? Math.max(0, blockHeight - detail.blockNumber + 1)
      : null;

  const isSuccess = detail?.status === "success";
  const statusLabel =
    detail?.status === "success"
      ? confirmations !== null
        ? t("explorer:txDetail.confirmedWithCount", { count: confirmations })
        : t("explorer:txDetail.confirmed")
      : detail?.status === "failed"
        ? t("explorer:txDetail.failed")
        : t("explorer:txDetail.pending");

  const approxUsd =
    detail !== null
      ? (detail.valueCmu * MOCK_USD_RATE).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "0.00";

  const gasUsedLabel =
    detail && detail.gasUsed !== null
      ? `${detail.gasUsed.toLocaleString()} / ${detail.gasLimit.toLocaleString()} (${Math.round(
          (detail.gasUsed / detail.gasLimit) * 100,
        )}%)`
      : detail
        ? detail.gasLimit.toLocaleString()
        : "--";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-slate-600 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
        >
          <ChevronLeft width={12} height={12} strokeWidth={2.5} />
          {t("explorer:txDetail.back")}
        </button>

        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-0.5">
            {t("explorer:txDetail.transaction")}
          </p>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800 dark:text-gray-100 tracking-tight font-mono">
              {tx.hash}
            </h2>
            {detail && (
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                  isSuccess
                    ? "text-emerald-600 bg-emerald-50 border-emerald-100"
                    : "text-red-600 bg-red-50 border-red-100"
                }`}
              >
                {isSuccess ? (
                  <Check width={10} height={10} strokeWidth={3} />
                ) : (
                  <AlertCircle width={10} height={10} />
                )}
                {isSuccess
                  ? t("explorer:txDetail.success")
                  : detail.status === "failed"
                    ? t("explorer:txDetail.failed")
                    : t("explorer:txDetail.pending")}
              </span>
            )}
          </div>
        </div>
      </div>

      {loading || !detail ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-12 shadow-sm text-center">
          <div className="w-6 h-6 rounded-full border-2 border-slate-200 dark:border-gray-700 border-t-blue-500 dark:border-t-accent animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
            {t("explorer:txDetail.loading")}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6 shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4">
                {t("explorer:txDetail.txHash")}
              </span>
              <span className="text-sm font-mono text-slate-800 dark:text-gray-100 break-all">
                {detail.hash}
              </span>
            </div>
            <div className="flex items-center pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4">
                {t("explorer:txDetail.status")}
              </span>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                  isSuccess
                    ? "text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/50"
                    : "text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/50"
                }`}
              >
                {isSuccess ? (
                  <Check width={10} height={10} strokeWidth={3} />
                ) : (
                  <AlertCircle width={10} height={10} />
                )}
                {statusLabel}
              </span>
            </div>
            <div className="flex items-center pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4">
                {t("explorer:txDetail.block")}
              </span>
              {detail.blockNumber !== null ? (
                <span
                  className="text-sm font-mono text-blue-600 dark:text-accent cursor-pointer hover:underline"
                  onClick={() => onBlockSelect(detail.blockNumber as number)}
                >
                  #{detail.blockNumber.toLocaleString()}
                </span>
              ) : (
                <span className="text-sm text-slate-400 dark:text-gray-400">
                  {t("explorer:txDetail.pending")}
                </span>
              )}
            </div>
            <div className="flex items-center pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4">
                {t("explorer:txDetail.timestamp")}
              </span>
              <span className="text-sm text-slate-800 dark:text-gray-100">
                {detail.timestamp !== null
                  ? formatDateTime(detail.timestamp * 1000, i18n.language)
                  : "--"}
              </span>
            </div>
            <div className="flex items-center pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4">
                {t("explorer:txDetail.from")}
              </span>
              <AddressBadge
                address={detail.from}
                leftAligned
                onClick={onAddressSelect}
              />
            </div>
            <div className="flex items-center pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4">
                {t("explorer:txDetail.to")}
              </span>
              <AddressBadge
                address={detail.to}
                leftAligned
                onClick={onAddressSelect}
              />
            </div>
            <div className="flex items-center pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4">
                {t("explorer:txDetail.value")}
              </span>
              <span className="text-sm font-bold text-slate-800 dark:text-gray-100">
                {detail.valueCmu.toFixed(4)} CMU
                <span className="text-xs font-medium text-slate-400 dark:text-gray-500 ml-2">
                  {"≈"} ${approxUsd}
                </span>
              </span>
            </div>
            <div className="flex items-center pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4">
                {t("explorer:txDetail.gasPrice")}
              </span>
              <span className="text-sm text-slate-800 dark:text-gray-100">
                {detail.gasPriceGwei} gwei
              </span>
            </div>
            <div className="flex items-center pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4">
                {t("explorer:txDetail.gasUsed")}
              </span>
              <span className="text-sm text-slate-800 dark:text-gray-100">
                {gasUsedLabel}
              </span>
            </div>
            <div className="flex items-center pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4">
                {t("explorer:txDetail.txFee")}
              </span>
              <span className="text-sm text-slate-800 dark:text-gray-100">
                {detail.feeCmu !== null
                  ? `${detail.feeCmu.toFixed(6)} CMU`
                  : "--"}
              </span>
            </div>
            <div className="flex items-center pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4">
                {t("explorer:txDetail.nonce")}
              </span>
              <span className="text-sm text-slate-800 dark:text-gray-100">
                {detail.nonce}
              </span>
            </div>
            <div className="flex items-start">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/4 pt-1">
                {t("explorer:txDetail.inputData")}
              </span>
              <div className="flex-1">
                {detail.input === "0x" || detail.input === "" ? (
                  <p className="text-sm font-mono text-slate-500 dark:text-gray-500 italic">
                    {t("explorer:txDetail.emptyInput")}
                  </p>
                ) : (
                  <p className="text-sm font-mono text-slate-800 dark:text-gray-300 break-all bg-slate-50 dark:bg-gray-800 p-2 rounded-lg border border-slate-100 dark:border-gray-700">
                    {detail.input}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { TransactionDetail };
export type { TransactionDetailProps };
