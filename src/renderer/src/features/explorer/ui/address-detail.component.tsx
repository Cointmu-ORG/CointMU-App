import {
  ADDRESS_TX_PAGE_SIZE,
  MOCK_USD_RATE,
  MS_PER_WEEK,
} from "../config/explorer.constants";
import { useState, useEffect, useMemo, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { getAddressSummary } from "../api/explorer.service";
import { AccountIcon, type DerivedAccount } from "@/features/wallet";
import { getTransactions, toActivityRow } from "@/features/wallet";
import type { WalletActivity } from "@bridge/types";
import { usePagination } from "@/shared/lib";
import { formatAge } from "@/shared/lib";
import { Sparkline, Pagination } from "@/shared/ui";
import { ChevronLeft, File, ChevronRight } from "lucide-react";
import { AddressBadge } from "./address-badge.component";

interface AddressDetailProps {
  address: string;
  accounts: DerivedAccount[];
  onBack: () => void;
  onAddressSelect: (address: string) => void;
  onTxHashSelect: (hash: string) => void;
}

/**
 * Address detail view presenting the balance, ownership and account-type badges,
 * a recent-window transaction summary, an illustrative balance-trend chart, and a
 * paginated list of recent transactions involving the address. Summary counts and
 * first/last seen are derived from the recent block-scan window, not full history.
 * @param props - The address, owned accounts, and navigation handlers.
 * @returns The rendered address detail view.
 */
function AddressDetail({
  address,
  accounts,
  onBack,
  onAddressSelect,
  onTxHashSelect,
}: AddressDetailProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const [balance, setBalance] = useState<string>("0.00");
  const [isContract, setIsContract] = useState<boolean>(false);
  const [activity, setActivity] = useState<WalletActivity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const load = async (): Promise<void> => {
      const [summary, txs] = await Promise.all([
        getAddressSummary(address),
        getTransactions([address]),
      ]);
      if (!mounted) {
        return;
      }
      setBalance(summary.balance);
      setIsContract(summary.isContract);
      setActivity(txs);
      setLoading(false);
    };

    load();
    return (): void => {
      mounted = false;
    };
  }, [address]);

  const transactions = useMemo(
    () => activity.map((tx) => toActivityRow(tx, t, i18n.language)),
    [activity, t, i18n.language],
  );

  const chartData = useMemo(() => {
    const currentBalance = parseFloat(balance.replace(/,/g, "")) || 0;
    const points: number[] = [currentBalance];
    let runningBal = currentBalance;

    for (const tx of transactions) {
      const txAmount = parseFloat(String(tx.amount).replace(/,/g, "")) || 0;

      if (tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
        runningBal -= txAmount;
      } else if (tx.from && tx.from.toLowerCase() === address.toLowerCase()) {
        runningBal += txAmount;
      }
      points.push(runningBal);
    }

    points.reverse();

    const padding = Array(30).fill(points[0] || 0);
    const paddedPoints = [...padding, ...points];

    if (paddedPoints.length < 2) {
      paddedPoints.push(paddedPoints[0] || 0);
    }

    return paddedPoints;
  }, [balance, transactions, address]);

  const pagination = usePagination(transactions, ADDRESS_TX_PAGE_SIZE);

  const isOwned = accounts.some(
    (account) => account.address.toLowerCase() === address.toLowerCase(),
  );
  const parsedBalance = parseFloat(balance.replace(/,/g, "")) || 0;
  const approxUsd = (parsedBalance * MOCK_USD_RATE).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const pastWeekCount = transactions.filter(
    (tx) => Date.now() - tx.timestamp * 1000 <= MS_PER_WEEK,
  ).length;
  const blockNumbers = transactions
    .map((tx) => tx.blockNumber)
    .filter((value): value is number => typeof value === "number");
  const firstSeen = blockNumbers.length > 0 ? Math.min(...blockNumbers) : null;
  const lastSeen = blockNumbers.length > 0 ? Math.max(...blockNumbers) : null;

  const abbrAddress = `${address.substring(0, 10)}...${address.substring(address.length - 8)}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-slate-600 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <ChevronLeft width={12} height={12} strokeWidth={2.5} />
            {t("explorer:addressDetail.back")}
          </button>
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-0.5">
              {t("explorer:addressDetail.address")}
            </p>
            <h2 className="text-xl font-bold text-slate-800 dark:text-gray-100 tracking-tight font-mono">
              {abbrAddress}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOwned && (
            <span className="text-xs font-semibold text-blue-600 dark:text-accent bg-blue-50 dark:bg-accent/20 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-accent/50">
              {t("explorer:addressDetail.yourWallet")}
            </span>
          )}
          <span className="text-xs font-semibold text-slate-600 dark:text-gray-300 bg-slate-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-700">
            {isContract
              ? t("explorer:addressDetail.contract")
              : t("explorer:addressDetail.eoa")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[1.2fr_1fr] gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-shrink-0 rounded-full overflow-hidden">
              <AccountIcon address={address} size={40} />
            </div>
            <div className="min-w-0">
              <p
                className="text-sm font-mono text-slate-700 dark:text-gray-200 truncate"
                title={address}
              >
                {address}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-sm font-medium text-slate-500 dark:text-gray-400">
                {t("explorer:addressDetail.balance")}
              </span>
              <span className="text-lg font-bold text-slate-800 dark:text-gray-100">
                {balance}{" "}
                <span className="text-sm font-medium text-slate-400 dark:text-gray-400">
                  CMU
                </span>
                <span className="text-xs font-medium text-slate-400 dark:text-gray-400 ml-2">
                  {"≈"} ${approxUsd}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-sm font-medium text-slate-500 dark:text-gray-400">
                {t("explorer:addressDetail.transactions")}
              </span>
              <span className="text-sm font-semibold text-slate-800 dark:text-gray-100">
                {t("explorer:addressDetail.recentTxsCount", {
                  recent: transactions.length,
                  pastWeek: pastWeekCount,
                })}
              </span>
            </div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-gray-800">
              <span className="text-sm font-medium text-slate-500 dark:text-gray-400">
                {t("explorer:addressDetail.firstSeen")}
              </span>
              <span className="text-sm font-semibold text-slate-800 dark:text-gray-100">
                {firstSeen !== null
                  ? t("explorer:addressDetail.blockNumber", {
                      number: firstSeen,
                    })
                  : t("explorer:addressDetail.none")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500 dark:text-gray-400">
                {t("explorer:addressDetail.lastSeen")}
              </span>
              <span className="text-sm font-semibold text-slate-800 dark:text-gray-100">
                {lastSeen !== null
                  ? t("explorer:addressDetail.blockNumber", {
                      number: lastSeen,
                    })
                  : t("explorer:addressDetail.none")}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-4">
            {t("explorer:addressDetail.derivedNotice")}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6 shadow-sm flex flex-col">
          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-4">
            {t("explorer:addressDetail.balanceTrend")}
          </p>
          <div className="flex-1 min-h-[120px]">
            <Sparkline
              data={chartData}
              className="w-full h-full text-blue-500"
              color="#3b82f6"
            />
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] text-slate-400 dark:text-gray-500">
              {t("explorer:addressDetail.daysAgo30")}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-gray-500">
              {t("explorer:addressDetail.today")}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-1">
          {t("explorer:addressDetail.recentTransactions")}
        </h3>
        <p className="text-[10px] text-slate-400 dark:text-gray-400 mb-5">
          {t("explorer:addressDetail.showingTxs", {
            visible: pagination.pageItems.length,
            total: transactions.length,
          })}
        </p>

        {loading ? (
          <div className="py-12 text-center">
            <div className="w-6 h-6 rounded-full border-2 border-slate-200 dark:border-gray-700 border-t-blue-500 dark:border-t-accent animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
              {t("explorer:addressDetail.loadingTxs")}
            </p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
              {t("explorer:addressDetail.noRecentTxs")}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-gray-800">
                  <th className="px-2 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:addressDetail.hash")}
                  </th>
                  <th className="px-2 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:addressDetail.from")}
                  </th>
                  <th className="px-2 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
                    {t("explorer:addressDetail.to")}
                  </th>
                  <th className="px-2 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400 text-right">
                    {t("explorer:addressDetail.amount")}
                  </th>
                  <th className="px-2 py-3 text-[9px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400 text-right">
                    {t("explorer:addressDetail.age")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {pagination.pageItems.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-blue-50 dark:bg-accent/20 flex items-center justify-center text-blue-500 dark:text-accent flex-shrink-0">
                          <File width={10} height={10} />
                        </div>
                        {tx.hash ? (
                          <span
                            className="text-xs font-mono text-blue-600 dark:text-accent cursor-pointer hover:underline"
                            onClick={() => onTxHashSelect(tx.hash as string)}
                          >
                            {tx.hash.substring(0, 10)}...
                            {tx.hash.substring(tx.hash.length - 8)}
                          </span>
                        ) : (
                          <span className="text-xs font-mono text-slate-400 dark:text-gray-400">
                            {tx.title}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <AddressBadge
                        address={tx.from ?? null}
                        leftAligned
                        onClick={onAddressSelect}
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1">
                        <ChevronRight
                          className="text-slate-300 dark:text-gray-600 flex-shrink-0"
                          width={12}
                          height={12}
                        />
                        <AddressBadge
                          address={tx.to ?? null}
                          leftAligned
                          onClick={onAddressSelect}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <span className="text-xs font-bold text-slate-800 dark:text-gray-100">
                        {tx.amount} CMU
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="flex flex-col items-end whitespace-nowrap">
                        <span className="text-[10px] text-slate-700 dark:text-gray-300 font-medium">
                          {formatAge(tx.timestamp, i18n.language)}
                        </span>
                        <span className="text-[9px] text-slate-500 dark:text-gray-500 mt-0.5">
                          {tx.timestampStr}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              onPageChange={pagination.setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}

export { AddressDetail };
export type { AddressDetailProps };
