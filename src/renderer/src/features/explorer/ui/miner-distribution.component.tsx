import {
  BAR_COLORS,
  BAR_SEGMENT_COLORS,
  MINER_POLL_INTERVAL_MS,
} from "../config/explorer.constants";
import { type JSX, useState, useEffect } from "react";
import { AccountIcon } from "@/features/wallet";
import { fetchMinerDistribution, type MinerEntry } from "@/features/mining";
import { MiningCacheService } from "@/features/mining";
import { Activity } from "lucide-react";

interface MinerDistributionProps {
  activeWalletAddress: string | null;
  isConnected: boolean;
}

/**
 * Formats a miner address for compact display by showing the first six and
 * last four characters separated by an ellipsis.
 * @param address - The full 0x-prefixed Ethereum address.
 * @returns A truncated address string.
 */
function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Renders a single miner row including the address avatar, label, percentage,
 * and progress bar. If the miner address matches the active wallet, '(you)'
 * is appended to the label. The 'others' sentinel renders a generic label.
 * @param entry - The miner distribution entry to render.
 * @param index - The row index used to select the bar colour.
 * @param activeWalletAddress - The currently selected wallet address for comparison.
 * @returns The rendered miner row element.
 */
function MinerRow({
  entry,
  index,
  activeWalletAddress,
}: {
  entry: MinerEntry;
  index: number;
  activeWalletAddress: string | null;
}): JSX.Element {
  const isOthers = entry.address === "others";
  const isYou =
    !isOthers &&
    activeWalletAddress != null &&
    entry.address.toLowerCase() === activeWalletAddress.toLowerCase();

  const colorClass = BAR_COLORS[index] ?? "bg-slate-400";
  const label = isOthers
    ? "Others"
    : `${shortAddress(entry.address)}${isYou ? " (you)" : ""}`;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0 rounded-full overflow-hidden">
        <AccountIcon address={entry.address} size={28} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-slate-700 dark:text-gray-300 truncate">
            {label}
          </span>
          <span className="text-xs font-bold text-slate-800 dark:text-gray-100 ml-2 flex-shrink-0">
            {entry.percentage.toFixed(1)}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${colorClass} rounded-full transition-all duration-500`}
            style={{ width: `${entry.percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Card component that displays the share of blocks mined by different
 * addresses over the past 24-hour UTC window. Serves cached data immediately
 * on mount to prevent layout shifts, then polls for fresh data every 60 seconds
 * in the background. The polling interval is cleared on unmount to prevent
 * memory leaks.
 * @param props - The active wallet address and network connection state.
 * @returns The rendered miner distribution card.
 */
export function MinerDistribution({
  activeWalletAddress,
  isConnected,
}: MinerDistributionProps): JSX.Element {
  const cached = MiningCacheService.getMinerDistribution();
  const [entries, setEntries] = useState<MinerEntry[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState(cached === undefined);

  useEffect(() => {
    if (!isConnected) {
      setIsLoading(false);
      return;
    }

    const onData = (data: MinerEntry[]): void => {
      setEntries(data);
      setIsLoading(false);
    };

    MiningCacheService.startMinerDistributionPolling(
      fetchMinerDistribution,
      onData,
      MINER_POLL_INTERVAL_MS,
    );

    return () => {
      MiningCacheService.stopMinerDistributionPolling();
    };
  }, [isConnected]);

  const isEmpty = !isLoading && entries.length === 0;

  return (
    <div className="flex-1 bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6 shadow-sm flex flex-col">
      <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100">
        Miner distribution
      </h3>
      <p className="text-[10px] text-slate-400 dark:text-gray-400 mt-0.5 mb-5">
        Share of blocks mined · past 24 hours
      </p>

      {isLoading ? (
        <div className="space-y-4 flex-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-gray-800 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2 bg-slate-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="h-1.5 bg-slate-100 dark:bg-gray-800 rounded-full w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <Activity
            className="text-slate-300 dark:text-gray-600 mb-2"
            width={28}
            height={28}
            strokeWidth={1.5}
          />
          <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
            Awaiting network activity
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
            No blocks mined in the past 24 hours
          </p>
        </div>
      ) : (
        <div className="space-y-4 flex-1">
          {entries.map((entry, i) => (
            <MinerRow
              key={entry.address}
              entry={entry}
              index={i}
              activeWalletAddress={activeWalletAddress}
            />
          ))}
        </div>
      )}

      <div className="mt-5 h-2 flex rounded-full overflow-hidden gap-0.5">
        {isEmpty || isLoading ? (
          <div className="h-full w-full bg-slate-100 dark:bg-gray-800 rounded-full" />
        ) : (
          entries.map((entry, i) => (
            <div
              key={entry.address}
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${entry.percentage}%`,
                backgroundColor: BAR_SEGMENT_COLORS[i] ?? "#94a3b8",
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
