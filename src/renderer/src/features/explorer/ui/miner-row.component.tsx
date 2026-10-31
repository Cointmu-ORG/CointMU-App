import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { AccountIcon } from "@/entities/account";
import { OTHERS_ADDRESS, type MinerEntry } from "@/entities/miner";
import { BAR_COLORS } from "../config/explorer.constants";

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
export function MinerRow({
  entry,
  index,
  activeWalletAddress,
}: {
  entry: MinerEntry;
  index: number;
  activeWalletAddress: string | null;
}): JSX.Element {
  const { t } = useTranslation();
  const isOthers = entry.address === OTHERS_ADDRESS;
  const isYou =
    !isOthers &&
    activeWalletAddress != null &&
    entry.address.toLowerCase() === activeWalletAddress.toLowerCase();

  const colorClass = BAR_COLORS[index] ?? "bg-slate-400";
  const label = isOthers
    ? t("explorer:minerDistribution.others")
    : isYou
      ? t("explorer:minerDistribution.addressYou", {
          address: shortAddress(entry.address),
        })
      : shortAddress(entry.address);

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
