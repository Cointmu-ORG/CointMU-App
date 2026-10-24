import {
  SELF_BLOCK_REWARD,
  ACTIVITY_WINDOW_MS,
  ACTIVITY_WINDOW_DAYS,
  SECONDS_TO_MS,
  ACTIVITY_TAB_FOUND,
  ACTIVITY_TAB_LOG,
  ACTIVITY_TAB_ACTIVITY,
  ACTIVITY_TABS,
} from "../config/mining.constants";
import { useMemo, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { subDays, format, differenceInMinutes } from "date-fns";
import { Card, Pagination } from "@/shared/ui";
import { WalletHistoryFilter } from "../../wallet/ui/wallet-history-filter.component";
import { Check, Box } from "lucide-react";
import { formatAge } from "@/shared/lib";
import { type FoundBlock } from "../model/mining.store";
import { type HistoryFilter } from "@/shared/model";
import { type DerivedAccount } from "@/features/wallet";
import { MiningActivityLogs } from "./mining-activity-logs.component";

export interface DayContribution {
  date: string;
  count: number;
}

interface MiningActivityProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  minedBlocks: FoundBlock[];
  scopedFoundBlocks: FoundBlock[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  accounts: DerivedAccount[];
  historyFilter: HistoryFilter;
  onFilterChange: (filter: HistoryFilter) => void;
}

interface FoundBlocksPanelProps {
  minedBlocks: FoundBlock[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  accounts: DerivedAccount[];
  historyFilter: HistoryFilter;
  onFilterChange: (filter: HistoryFilter) => void;
}

interface ActivityGraphPanelProps {
  contributions: DayContribution[];
  acceptedDays: number;
  rejectedDays: number;
  minutesSinceLast: number | null;
}

/**
 * Builds a contribution series covering strictly the last 30 calendar days.
 * Days with at least one block count as 'accepted'; days with zero count as
 * 'rejected'. The series is ordered oldest to newest.
 * @param blocks - The subset of found blocks within the 30-day window.
 * @returns An ordered array of 30 day-contribution records.
 */
function buildMonthContributions(blocks: FoundBlock[]): DayContribution[] {
  const countsByDate = new Map<string, number>();
  for (const block of blocks) {
    const key = format(new Date(block.timestamp * SECONDS_TO_MS), "yyyy-MM-dd");
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }
  const today = new Date();
  const contributions: DayContribution[] = [];
  for (let offset = ACTIVITY_WINDOW_DAYS - 1; offset >= 0; offset--) {
    const date = format(subDays(today, offset), "yyyy-MM-dd");
    contributions.push({ date, count: countsByDate.get(date) ?? 0 });
  }
  return contributions;
}

/**
 * Returns the Tailwind background class for a single day cell based on the
 * number of blocks found that day.
 * @param count - The number of blocks found on a given day.
 * @returns The Tailwind background class string.
 */
function cellClass(count: number): string {
  if (count <= 0) return "bg-slate-100";
  if (count <= 2) return "bg-green-200";
  if (count <= 5) return "bg-green-400";
  return "bg-green-600";
}

/**
 * Displays the paginated list of blocks found by the selected wallet(s),
 * with an empty state when none exist and a filter control at the top.
 * @param props - The block list, pagination state, filter value, and accounts.
 * @returns The rendered found-blocks panel.
 */
function FoundBlocksPanel({
  minedBlocks,
  currentPage,
  totalPages,
  onPageChange,
  accounts,
  historyFilter,
  onFilterChange,
}: FoundBlocksPanelProps): JSX.Element {
  const { t, i18n } = useTranslation();

  return (
    <div>
      <div className="flex mb-2">
        <WalletHistoryFilter
          accounts={accounts}
          value={historyFilter}
          onChange={onFilterChange}
          className="ml-auto w-48"
          compact
        />
      </div>
      <div className="relative z-0 h-[280px] overflow-y-auto pr-1">
        {minedBlocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Box
              className="text-slate-300 dark:text-gray-600 mb-3"
              width={32}
              height={32}
            />
            <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
              {t("mining:activity.noBlocks")}
            </p>
            <p className="text-xs text-slate-400 dark:text-gray-400 mt-1">
              {t("mining:activity.startMining")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-gray-800">
            {minedBlocks.map((block) => (
              <div
                key={block.hash}
                className="flex items-center justify-between py-4 px-2 hover:bg-slate-50/50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-50 dark:bg-gray-800 border border-emerald-100 dark:border-gray-800 flex items-center justify-center text-emerald-500">
                    <Check width={16} height={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-gray-100">
                        #{block.number.toLocaleString()}
                      </span>
                      <span className="text-xs font-mono text-slate-400 dark:text-gray-400">
                        {block.hash.substring(0, 6)}...
                        {block.hash.substring(block.hash.length - 4)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                      {formatAge(block.timestamp, i18n.language)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-bold text-emerald-500 tracking-tight">
                    {SELF_BLOCK_REWARD}
                  </span>
                  <span className="text-xs font-medium text-emerald-500/70 ml-1">
                    CMU
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}

/**
 * Renders the 30-day block-contribution heat map along with the elapsed time
 * since the most recent found block and the accepted/rejected day tally.
 * @param props - The contribution series, day counts, and last-block age.
 * @returns The rendered activity graph panel.
 */
function ActivityGraphPanel({
  contributions,
  acceptedDays,
  rejectedDays,
  minutesSinceLast,
}: ActivityGraphPanelProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="py-2">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 mb-3">
        {minutesSinceLast !== null
          ? minutesSinceLast === 1
            ? t("mining:activity.acceptedSharesLastMin", {
                count: minutesSinceLast,
              })
            : t("mining:activity.acceptedSharesLastMins", {
                count: minutesSinceLast,
              })
          : t("mining:activity.acceptedSharesNoActivity")}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {contributions.map((day) => (
          <div
            key={day.date}
            title={`${day.date}: ${day.count} block${day.count === 1 ? "" : "s"}`}
            className={`w-4 h-4 rounded-sm ${cellClass(day.count)}`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 dark:border-gray-800">
        <p className="text-[11px] font-medium text-slate-500 dark:text-gray-400">
          <span className="font-bold text-emerald-600">{acceptedDays}</span>
          {t("mining:activity.sharesAccepted")}
          <span className="font-bold text-red-500">{rejectedDays}</span>
          {t("mining:activity.rejected")}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 dark:text-gray-400 mr-1">
            {t("mining:activity.less")}
          </span>
          <div className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-gray-800" />
          <div className="w-3 h-3 rounded-sm bg-green-200" />
          <div className="w-3 h-3 rounded-sm bg-green-400" />
          <div className="w-3 h-3 rounded-sm bg-green-600" />
          <span className="text-[10px] text-slate-400 dark:text-gray-400 ml-1">
            {t("mining:activity.more")}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Mining activity card exposing three tabs: blocks the selected wallets have
 * found, the raw node activity log, and a compact 30-day contribution graph.
 * The graph header shows elapsed time since the most recent block, and the
 * footer tallies accepted versus rejected days across the 30-day window.
 * @param props - The active tab, tab handler, pagination state, filter state,
 *        owned wallets, and the block data for each tab.
 * @returns The rendered mining activity card.
 */
function MiningActivity({
  activeTab,
  onTabChange,
  minedBlocks,
  scopedFoundBlocks,
  currentPage,
  totalPages,
  onPageChange,
  accounts,
  historyFilter,
  onFilterChange,
}: MiningActivityProps): JSX.Element {
  const { t } = useTranslation();

  const recentBlocks = useMemo(() => {
    const cutoff = Date.now() - ACTIVITY_WINDOW_MS;
    return scopedFoundBlocks.filter(
      (block) => block.timestamp * SECONDS_TO_MS >= cutoff,
    );
  }, [scopedFoundBlocks]);

  const contributions = useMemo(
    () => buildMonthContributions(recentBlocks),
    [recentBlocks],
  );

  const acceptedDays = useMemo(
    () => contributions.filter((d) => d.count > 0).length,
    [contributions],
  );

  const rejectedDays = ACTIVITY_WINDOW_DAYS - acceptedDays;

  const minutesSinceLast = useMemo(() => {
    if (recentBlocks.length === 0) return null;
    const latestBlock = recentBlocks.reduce((a, b) =>
      a.timestamp > b.timestamp ? a : b,
    );
    return differenceInMinutes(
      Date.now(),
      latestBlock.timestamp * SECONDS_TO_MS,
    );
  }, [recentBlocks]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100">
            {t("mining:activity.title")}
          </h3>
          <p className="text-[10px] text-slate-400 dark:text-gray-400 mt-0.5">
            {t("mining:activity.subtitle")}
          </p>
        </div>
        <div className="relative z-10 flex items-center rounded-lg border border-slate-200 dark:border-gray-700 overflow-hidden">
          {ACTIVITY_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === tab
                  ? "bg-slate-800 dark:bg-gray-700 text-white dark:text-gray-100"
                  : "bg-white dark:bg-gray-800 text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-700"
              }`}
            >
              {tab === ACTIVITY_TAB_FOUND && t("mining:activity.tabFound")}
              {tab === ACTIVITY_TAB_LOG && t("mining:activity.tabLog")}
              {tab === ACTIVITY_TAB_ACTIVITY &&
                t("mining:activity.tabActivity")}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {activeTab === ACTIVITY_TAB_FOUND && (
          <FoundBlocksPanel
            minedBlocks={minedBlocks}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
            accounts={accounts}
            historyFilter={historyFilter}
            onFilterChange={onFilterChange}
          />
        )}

        {activeTab === ACTIVITY_TAB_LOG && <MiningActivityLogs />}

        {activeTab === ACTIVITY_TAB_ACTIVITY && (
          <ActivityGraphPanel
            contributions={contributions}
            acceptedDays={acceptedDays}
            rejectedDays={rejectedDays}
            minutesSinceLast={minutesSinceLast}
          />
        )}
      </div>
    </Card>
  );
}

export { MiningActivity, ACTIVITY_TAB_FOUND };
export type { MiningActivityProps };
