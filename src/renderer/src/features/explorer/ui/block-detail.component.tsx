import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { hexToAscii } from "../lib/explorer.utils";
import { formatAge } from "@/shared/lib";
import { ChevronLeft, Square, File } from "lucide-react";
import { AddressBadge } from "./address-badge.component";

interface BlockDetailProps {
  block: any;
  onBack: () => void;
  onBlockSelect: (blockNumber: number) => void;
  onTransactionSelect: (tx: any) => void;
  onAddressSelect: (address: string) => void;
}

/**
 * Detailed block view presenting the block overview, reward, surrounding chain
 * position, and the list of transactions contained in the block.
 * @param props - The selected block and the navigation and selection handlers.
 * @returns The rendered block detail view.
 */
function BlockDetail({
  block,
  onBack,
  onBlockSelect,
  onTransactionSelect,
  onAddressSelect,
}: BlockDetailProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const blockNumber = parseInt(block.number, 16);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-slate-600 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
      >
        <ChevronLeft width={12} height={12} strokeWidth={2.5} />
        {t("explorer:blockDetail.back")}
      </button>

      <div>
        <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-1">
          {t("explorer:blockDetail.block")}
        </p>
        <h2 className="text-3xl font-bold text-slate-800 dark:text-gray-100 tracking-tight font-mono">
          {blockNumber}
        </h2>
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-5">
            {t("explorer:blockDetail.overview")}
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.blockHeight")}
              </span>
              <span className="text-sm font-mono text-slate-800 dark:text-gray-100 text-right">
                {blockNumber}
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.status")}
              </span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{" "}
                {t("explorer:blockDetail.finalized")}
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.timestamp")}
              </span>
              <span className="text-sm text-slate-800 dark:text-gray-100 text-right">
                {new Date(
                  parseInt(block.timestamp, 16) * 1000,
                ).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.hash")}
              </span>
              <span className="text-sm font-mono text-slate-800 dark:text-gray-100 text-right">
                {block.hash}
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.parentHash")}
              </span>
              <span className="text-sm font-mono text-slate-800 dark:text-gray-100 text-right break-all">
                {block.parentHash}
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.merkleRoot")}
              </span>
              <span className="text-sm font-mono text-slate-800 text-right break-all">
                {block.transactionsRoot}
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.miner")}
              </span>
              <AddressBadge address={block.miner} onClick={onAddressSelect} />
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.nonce")}
              </span>
              <span className="text-sm font-mono text-slate-800 dark:text-gray-100 text-right">
                {parseInt(block.nonce, 16).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.difficulty")}
              </span>
              <span className="text-sm font-mono text-slate-800 dark:text-gray-100 text-right">
                {parseInt(block.difficulty, 16).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.blockSize")}
              </span>
              <span className="text-sm font-mono text-slate-800 dark:text-gray-100 text-right">
                {t("explorer:blockDetail.bytes", {
                  size: parseInt(block.size, 16).toLocaleString(),
                })}
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.transactions")}
              </span>
              <span className="text-sm font-mono text-slate-800 dark:text-gray-100 text-right">
                {t("explorer:blockDetail.txsCount", {
                  count: block.transactions?.length || 0,
                })}
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3">
                {t("explorer:blockDetail.gasUsedLimit")}
              </span>
              <span className="text-sm font-mono text-slate-800 dark:text-gray-100 text-right">
                {parseInt(block.gasUsed, 16).toLocaleString()} /{" "}
                {parseInt(block.gasLimit, 16).toLocaleString()}
              </span>
            </div>
            <div className="flex items-start justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 w-1/3 pt-1">
                {t("explorer:blockDetail.extraData")}
              </span>
              <div className="text-right flex-1">
                <p className="text-sm font-mono text-slate-800 dark:text-gray-100 break-all bg-slate-50 dark:bg-gray-950 p-2 rounded-lg border border-slate-100 dark:border-gray-700">
                  {block.extraData}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-2 italic font-mono px-1">
                  {t("explorer:blockDetail.ascii", {
                    ascii:
                      hexToAscii(block.extraData) ||
                      t("explorer:blockDetail.noneAscii"),
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-2">
              {t("explorer:blockDetail.blockReward")}
            </h3>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-500 font-mono tracking-tight">
              +2.00{" "}
              <span className="text-sm font-medium text-slate-400 dark:text-gray-500">
                CMU
              </span>
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6 shadow-sm flex-1">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-gray-400 tracking-widest uppercase mb-4">
              {t("explorer:blockDetail.chainPosition")}
            </h3>
            <div className="flex flex-col gap-3">
              {[
                blockNumber - 3,
                blockNumber - 2,
                blockNumber - 1,
                blockNumber,
                blockNumber + 1,
              ].map((num) => {
                if (num < 0) return null;
                const isCurrent = num === blockNumber;
                return (
                  <div
                    key={num}
                    className={`flex items-center gap-3 p-2 rounded-lg ${isCurrent ? "bg-blue-50 dark:bg-accent/20 border border-blue-100 dark:border-accent" : ""}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${isCurrent ? "bg-blue-500 dark:bg-accent text-white shadow-sm shadow-blue-200 dark:shadow-accent/20" : "bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-gray-500"}`}
                    >
                      <Square width={14} height={14} strokeWidth={2.5} />
                    </div>
                    <span
                      className={`text-sm font-mono font-bold cursor-pointer hover:underline ${isCurrent ? "text-blue-700 dark:text-accent" : "text-slate-500 dark:text-gray-400"}`}
                      onClick={() => onBlockSelect(num)}
                    >
                      #{num}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-1">
          {t("explorer:blockDetail.txsInBlock")}
        </h3>
        <p className="text-[10px] text-slate-400 dark:text-gray-400 mb-5">
          {t("explorer:blockDetail.entriesCount", {
            count: block.transactions?.length || 0,
          })}
        </p>

        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 dark:border-gray-800">
              <th className="px-2 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                {t("explorer:blockDetail.tableHash")}
              </th>
              <th className="px-2 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                {t("explorer:blockDetail.tableFrom")}
              </th>
              <th className="px-2 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                {t("explorer:blockDetail.tableTo")}
              </th>
              <th className="px-2 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400 text-right">
                {t("explorer:blockDetail.tableAmount")}
              </th>
              <th className="px-2 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400 text-right">
                {t("explorer:blockDetail.tableAge")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {block.transactions && block.transactions.length > 0 ? (
              block.transactions.map((tx: any) => (
                <tr
                  key={tx.hash}
                  className="hover:bg-slate-50/50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-2 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-blue-50 dark:bg-accent/20 flex items-center justify-center text-blue-500 dark:text-accent flex-shrink-0">
                        <File width={10} height={10} />
                      </div>
                      <span
                        className="text-xs font-mono text-blue-600 dark:text-accent cursor-pointer hover:underline"
                        onClick={() => onTransactionSelect(tx)}
                      >
                        {tx.hash.substring(0, 10)}...
                        {tx.hash.substring(tx.hash.length - 8)}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-3.5">
                    <AddressBadge
                      address={tx.from}
                      leftAligned
                      onClick={onAddressSelect}
                    />
                  </td>
                  <td className="px-2 py-3.5">
                    <AddressBadge
                      address={tx.to}
                      leftAligned
                      onClick={onAddressSelect}
                    />
                  </td>
                  <td className="px-2 py-3.5 text-right">
                    <span className="text-xs font-bold text-slate-800 dark:text-gray-100">
                      {(parseInt(tx.value, 16) / 1e18).toFixed(4)} CMU
                    </span>
                  </td>
                  <td className="px-2 py-3.5 text-right">
                    <span className="text-[10px] text-slate-500 dark:text-gray-400">
                      {formatAge(parseInt(block.timestamp, 16), i18n.language)}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-2 py-12 text-center">
                  <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
                    {t("explorer:blockDetail.noTxs")}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { BlockDetail };
export type { BlockDetailProps };
