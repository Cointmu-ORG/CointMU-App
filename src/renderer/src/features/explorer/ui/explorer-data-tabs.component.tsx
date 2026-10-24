import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { type BlockData } from "@/shared/lib";
import { AccountIcon } from "@/features/wallet";
import { useAppStore } from "@/shared/model";
import { SkeletonTable, Pagination, type ActivityData } from "@/shared/ui";
import { MinerDistribution } from "./miner-distribution.component";
import { formatAge } from "@/shared/lib";

type TabState = "blocks" | "transactions" | "accounts";

interface TopAccount {
  address: string;
  balance: number;
  percentage: number;
}

interface ExplorerDataTabsProps {
  activeTab: TabState;
  onTabChange: (tab: TabState) => void;
  isConnected: boolean;
  recentBlocks: BlockData[];
  topAccounts: TopAccount[];
  isLoadingAccounts: boolean;
  activeWalletAddress: string | null;
  onBlockSelect: (blockNumber: number) => void;
  onAddressSelect: (address: string) => void;
  onTxHashSelect: (hash: string) => void;
  transactions: ActivityData[];
  txCurrentPage: number;
  txTotalPages: number;
  onTxPageChange: (page: number) => void;
}

/**
 * Abbreviates a hex address or hash for compact table display.
 * @param value - The address or hash to shorten.
 * @returns The shortened representation, or a dash when absent.
 */
function shortHex(value: string | undefined): string {
  if (!value) return "--";
  return `${value.substring(0, 8)}...${value.substring(value.length - 6)}`;
}

/**
 * Explorer main data area combining the tab switcher, the live block,
 * transaction, and top-account tables, and the miner distribution panel.
 * @param props - The active tab, connection state, data sets, and handlers.
 * @returns The rendered data tabs and distribution panel.
 */
function ExplorerDataTabs({
  activeTab,
  onTabChange,
  isConnected,
  recentBlocks,
  topAccounts,
  isLoadingAccounts,
  onBlockSelect,
  onAddressSelect,
  onTxHashSelect,
  transactions,
  txCurrentPage,
  txTotalPages,
  onTxPageChange,
  activeWalletAddress,
}: ExplorerDataTabsProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const balances = useAppStore((s) => s.balances);

  const checkIfMinedByMe = (
    minerAddress: string,
    balancesMap: Record<string, string>,
  ): boolean => {
    if (!minerAddress || !balancesMap) return false;
    const allMyAddresses = Object.keys(balancesMap).map((addr) =>
      addr.toLowerCase(),
    );
    return allMyAddresses.includes(minerAddress.toLowerCase());
  };

  return (
    <div className="flex gap-6">
      <div className="flex-[2] min-w-0 bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTabChange("blocks")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === "blocks" ? "bg-slate-100 dark:bg-gray-800 text-slate-800 dark:text-gray-100" : "text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800"}`}
            >
              {t("explorer:dataTabs.latestBlocks")}
            </button>
            <button
              onClick={() => onTabChange("transactions")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === "transactions" ? "bg-slate-100 dark:bg-gray-800 text-slate-800 dark:text-gray-100" : "text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800"}`}
            >
              {t("explorer:dataTabs.transactions")}
            </button>
            <button
              onClick={() => onTabChange("accounts")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === "accounts" ? "bg-slate-100 dark:bg-gray-800 text-slate-800 dark:text-gray-100" : "text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800"}`}
            >
              {t("explorer:dataTabs.topAccounts")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-400 dark:text-gray-400">
              {t("explorer:dataTabs.autoRefresh")}
            </span>
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded ${isConnected ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-slate-100 dark:bg-gray-800"}`}
            >
              {isConnected && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              <span
                className={`text-[9px] font-bold uppercase ${isConnected ? "text-emerald-600 dark:text-emerald-500" : "text-slate-500 dark:text-gray-400"}`}
              >
                {isConnected
                  ? t("explorer:dataTabs.live")
                  : t("explorer:dataTabs.off")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {activeTab === "blocks" && (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-gray-800">
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:dataTabs.tableBlock")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:dataTabs.tableMinerHash")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:dataTabs.tableTxs")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:dataTabs.tableReward")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400 text-right">
                    {t("explorer:dataTabs.tableAge")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {recentBlocks.length > 0 ? (
                  recentBlocks.map((block) => (
                    <tr
                      key={block.hash}
                      className="hover:bg-slate-50/50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <p
                          className="text-sm font-semibold text-blue-600 dark:text-accent cursor-pointer hover:underline"
                          onClick={() => onBlockSelect(block.number)}
                        >
                          #{block.number}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex-shrink-0 rounded-full overflow-hidden">
                            <AccountIcon address={block.miner} size={24} />
                          </div>
                          <div>
                            <p
                              className="text-xs font-mono text-slate-800 dark:text-gray-100 cursor-pointer hover:text-blue-600 dark:hover:text-accent hover:underline"
                              onClick={() => onAddressSelect(block.miner)}
                            >
                              {block.miner.substring(0, 10)}...
                              {block.miner.substring(block.miner.length - 8)}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-gray-400 mt-0.5">
                              {t("explorer:blockDetail.hash")}{" "}
                              {block.hash.substring(0, 14)}...
                            </p>
                          </div>
                          {checkIfMinedByMe(block.miner, balances) && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-accent/20 text-[9px] font-bold text-blue-600 dark:text-accent uppercase tracking-wider">
                              {t("explorer:dataTabs.you")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs font-semibold text-slate-700 dark:text-gray-300">
                          {block.txCount}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-bold text-slate-800 dark:text-gray-100">
                            2.00
                          </p>
                          <span className="text-[9px] font-semibold text-slate-400 dark:text-gray-400">
                            CMU
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <p className="text-[10px] text-slate-500 dark:text-gray-400">
                          {formatAge(block.timestamp, i18n.language)}
                        </p>
                      </td>
                    </tr>
                  ))
                ) : isConnected ? (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <SkeletonTable columns={5} rowCount={5} />
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
                        {t("explorer:dataTabs.awaitingActivity")}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
                        {t("explorer:dataTabs.blockDataRequires")}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === "transactions" && (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-gray-800">
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:dataTabs.tableHash")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:dataTabs.tableFrom")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:dataTabs.tableTo")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400 text-right">
                    {t("explorer:dataTabs.tableAmount")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400 text-right">
                    {t("explorer:dataTabs.tableAge")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {transactions.length > 0 ? (
                  transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-5 py-2.5">
                        <p
                          className="text-xs font-mono text-blue-600 dark:text-accent cursor-pointer hover:underline"
                          onClick={() =>
                            tx.hash && onTxHashSelect(tx.hash as string)
                          }
                        >
                          {shortHex(tx.hash || tx.id)}
                        </p>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 rounded-full overflow-hidden">
                            <AccountIcon address={tx.from || ""} size={20} />
                          </div>
                          <p
                            className="text-xs font-mono text-slate-700 dark:text-gray-200 cursor-pointer hover:text-blue-600 dark:hover:text-accent hover:underline"
                            onClick={() => tx.from && onAddressSelect(tx.from)}
                          >
                            {shortHex(tx.from)}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 rounded-full overflow-hidden">
                            <AccountIcon address={tx.to || ""} size={20} />
                          </div>
                          <p
                            className="text-xs font-mono text-slate-700 dark:text-gray-200 cursor-pointer hover:text-blue-600 dark:hover:text-accent hover:underline"
                            onClick={() => tx.to && onAddressSelect(tx.to)}
                          >
                            {shortHex(tx.to)}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <p className="text-xs font-bold text-slate-800 dark:text-gray-100">
                            {tx.amount}
                          </p>
                          <span className="text-[9px] font-semibold text-slate-400 dark:text-gray-400">
                            CMU
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <div className="flex flex-col items-end whitespace-nowrap">
                          <p className="text-[10px] text-slate-700 dark:text-gray-300 font-medium">
                            {formatAge(tx.timestamp, i18n.language)}
                          </p>
                          <p className="text-[9px] text-slate-500 dark:text-gray-500 mt-0.5">
                            {tx.timestampStr}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : isConnected ? (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <SkeletonTable columns={5} rowCount={5} />
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
                        {t("explorer:dataTabs.noTxsFound")}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
                        {t("explorer:dataTabs.noTxsOccurred")}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === "transactions" && (
            <div className="px-5 pb-3">
              <Pagination
                currentPage={txCurrentPage}
                totalPages={txTotalPages}
                onPageChange={onTxPageChange}
              />
            </div>
          )}

          {activeTab === "accounts" && (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-gray-800">
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:dataTabs.tableNumber")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:dataTabs.tableAddress")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:dataTabs.tableTag")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400 text-right">
                    {t("explorer:dataTabs.tableBalance")}
                  </th>
                  <th className="px-5 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400 text-right">
                    {t("explorer:dataTabs.tableSupply")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {isLoadingAccounts ? (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <SkeletonTable columns={5} rowCount={5} />
                    </td>
                  </tr>
                ) : topAccounts.length > 0 ? (
                  topAccounts.map((acc, i) => (
                    <tr
                      key={acc.address}
                      className="hover:bg-slate-50/50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <p className="text-xs font-bold text-slate-500 dark:text-gray-400">
                          {i + 1}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex-shrink-0 rounded-full overflow-hidden">
                            <AccountIcon address={acc.address} size={24} />
                          </div>
                          <p
                            className="text-xs font-mono text-blue-600 dark:text-accent cursor-pointer hover:underline"
                            onClick={() => onAddressSelect(acc.address)}
                          >
                            {acc.address.substring(0, 10)}...
                            {acc.address.substring(acc.address.length - 8)}
                          </p>
                          {checkIfMinedByMe(acc.address, balances) && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-accent/20 text-[9px] font-bold text-blue-600 dark:text-accent uppercase tracking-wider">
                              {t("explorer:dataTabs.you")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-1 rounded bg-slate-100 dark:bg-gray-800 text-[10px] font-medium text-slate-500 dark:text-gray-400">
                          {t("explorer:dataTabs.miner")}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <p className="text-xs font-bold text-slate-800 dark:text-gray-100">
                            {acc.balance.toLocaleString(undefined, {
                              minimumFractionDigits:
                                acc.balance % 1 === 0 ? 1 : 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                          <span className="text-[9px] font-semibold text-slate-400 dark:text-gray-400">
                            CMU
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <p className="text-[10px] text-slate-500 dark:text-gray-400">
                          {acc.percentage.toFixed(2)} %
                        </p>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
                        {t("explorer:dataTabs.awaitingActivity")}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">
                        {t("explorer:dataTabs.accountDataRequires")}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <MinerDistribution
        activeWalletAddress={activeWalletAddress}
        isConnected={isConnected}
      />
    </div>
  );
}

export { ExplorerDataTabs };
export type { ExplorerDataTabsProps, TabState };
