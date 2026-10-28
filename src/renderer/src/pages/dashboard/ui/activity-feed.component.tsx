import type { DerivedAccount } from "@/entities/account";
import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { ActivityItem, type ActivityData } from "@/shared/ui";
import { Pagination } from "@/shared/ui";
import { WalletHistoryFilter } from "@/features/wallet";
import { ChevronRight, Clock } from "lucide-react";
import { downloadActivityCsv } from "@/shared/lib";
import { type HistoryFilter } from "@/shared/model";
import { ACTIVITY_CSV_FILENAME } from "../config/dashboard.constants";

interface ActivityFeedProps {
  isConnected: boolean;
  activity: ActivityData[];
  pageItems: ActivityData[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  accounts: DerivedAccount[];
  historyFilter: HistoryFilter;
  onFilterChange: (filter: HistoryFilter) => void;
}

/**
 * Activity feed panel listing the aggregated transaction history for the wallets
 * selected by the global history filter. It renders the current page of records,
 * a wallet filter dropdown, page controls, and a CSV export of the full
 * fetched dataset.
 * @param props - Connection state, the full and paginated records, pagination
 *        state and handler, the owned wallets, and the filter value and handler.
 * @returns The rendered activity feed panel.
 */
function ActivityFeed({
  isConnected,
  activity,
  pageItems,
  currentPage,
  totalPages,
  onPageChange,
  accounts,
  historyFilter,
  onFilterChange,
}: ActivityFeedProps): JSX.Element {
  const hasActivity = isConnected && activity.length > 0;
  const { t } = useTranslation();

  /**
   * Exports the full fetched activity history to a CSV download.
   */
  const handleExport = (): void =>
    downloadActivityCsv(activity, ACTIVITY_CSV_FILENAME);

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100">
          {t("dashboard:activityFeed.yourActivity")}
        </h3>
        <button
          onClick={handleExport}
          disabled={!hasActivity}
          className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("dashboard:activityFeed.export")}
          <ChevronRight width={10} height={10} strokeWidth={3} />
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] text-slate-400 font-mono">
          {t("dashboard:activityFeed.aggregatedHistory")}
        </p>
        <WalletHistoryFilter
          accounts={accounts}
          value={historyFilter}
          onChange={onFilterChange}
          className="w-32"
          compact
        />
      </div>

      <div className="space-y-0">
        {hasActivity ? (
          <>
            <div className="divide-y divide-slate-100 dark:divide-gray-800 -mx-2">
              {pageItems.map((item) => (
                <ActivityItem key={item.id} activity={item} />
              ))}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          </>
        ) : (
          <div className="py-8 flex flex-col items-center justify-center">
            <Clock
              className="text-slate-300 mb-2"
              width={28}
              height={28}
              strokeWidth={1.5}
            />
            <p className="text-sm font-medium text-slate-400">
              {t("dashboard:activityFeed.noActivity")}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {t("dashboard:activityFeed.startMining")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export { ActivityFeed };
export type { ActivityFeedProps };
