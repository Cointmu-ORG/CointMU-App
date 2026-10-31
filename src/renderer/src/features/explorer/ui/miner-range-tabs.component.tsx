import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { MinerRange } from "@bridge/types";
import { MINER_RANGE_OPTIONS } from "../config/explorer.constants";

interface MinerRangeTabsProps {
  value: MinerRange;
  onChange: (range: MinerRange) => void;
}

/**
 * Segmented control choosing the miner distribution window: week, month or
 * all time. Each segment is a toggle button (aria-pressed).
 * @param props - The selected range and the change handler.
 * @returns The rendered segment group.
 */
export function MinerRangeTabs({
  value,
  onChange,
}: MinerRangeTabsProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("explorer:minerDistribution.range.label")}
      className="flex gap-1 p-0.5 rounded-lg bg-slate-50 dark:bg-gray-800/60"
    >
      {MINER_RANGE_OPTIONS.map((option) => {
        const isSelected = option.range === value;
        return (
          <button
            key={option.range}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(option.range)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isSelected ? "bg-white dark:bg-gray-700 text-slate-800 dark:text-gray-100 shadow-sm" : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"}`}
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
