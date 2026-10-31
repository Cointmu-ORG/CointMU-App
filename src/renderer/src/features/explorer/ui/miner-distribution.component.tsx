import { type JSX, useState } from "react";
import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MinerRange } from "@bridge/types";
import type { MinerDistribution as MinerDistributionData } from "@/entities/miner";
import {
  BAR_SEGMENT_COLORS,
  MINER_EMPTY_KEYS,
  MINER_SUBTITLE_KEYS,
} from "../config/explorer.constants";
import { useMinerDistribution } from "../lib/miner-distribution.hook";
import { MinerIndexNotice } from "./miner-index-notice.component";
import { MinerRangeTabs } from "./miner-range-tabs.component";
import { MinerRow } from "./miner-row.component";

const SKELETON_ROWS = 4;
const FALLBACK_SEGMENT_COLOR = "#94a3b8";

interface MinerDistributionProps {
  activeWalletAddress: string | null;
}

function LoadingRows(): JSX.Element {
  return (
    <div className="space-y-4 flex-1">
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-gray-800 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2 bg-slate-200 dark:bg-gray-700 rounded w-3/4" />
            <div className="h-1.5 bg-slate-100 dark:bg-gray-800 rounded-full w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ detail }: { detail: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
      <Activity
        className="text-slate-300 dark:text-gray-600 mb-2"
        width={28}
        height={28}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
        {t("explorer:dataTabs.awaitingActivity")}
      </p>
      <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
        {detail}
      </p>
    </div>
  );
}

function ShareBar({
  data,
}: {
  data: MinerDistributionData | null;
}): JSX.Element {
  const entries = data?.entries ?? [];
  return (
    <div className="mt-5 h-2 flex rounded-full overflow-hidden gap-0.5">
      {entries.length === 0 ? (
        <div className="h-full w-full bg-slate-100 dark:bg-gray-800 rounded-full" />
      ) : (
        entries.map((entry, i) => (
          <div
            key={entry.address}
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${entry.percentage}%`,
              backgroundColor: BAR_SEGMENT_COLORS[i] ?? FALLBACK_SEGMENT_COLOR,
            }}
          />
        ))
      )}
    </div>
  );
}

/**
 * Card with the share of blocks mined per address over the past week, month
 * or all time, read from the main-process block index. While the index is
 * still backfilling the range it shows the partial data with its progress,
 * and while the node is unreachable it keeps showing the indexed data.
 * @param props - The active wallet address, marked "(you)" in the list.
 * @returns The rendered miner distribution card.
 */
export function MinerDistribution({
  activeWalletAddress,
}: MinerDistributionProps): JSX.Element {
  const { t } = useTranslation();
  const [range, setRange] = useState<MinerRange>(MinerRange.WEEK);
  const { distribution, isLoading } = useMinerDistribution(range);

  let body: JSX.Element;
  if (isLoading) {
    body = <LoadingRows />;
  } else if (distribution === null) {
    body = <EmptyState detail={t("explorer:minerDistribution.unavailable")} />;
  } else if (distribution.entries.length === 0) {
    const detail = distribution.isComplete
      ? t(MINER_EMPTY_KEYS[range])
      : t("explorer:minerDistribution.emptyPartial");
    body = <EmptyState detail={detail} />;
  } else {
    body = (
      <div className="space-y-4 flex-1">
        {distribution.entries.map((entry, i) => (
          <MinerRow
            key={entry.address}
            entry={entry}
            index={i}
            activeWalletAddress={activeWalletAddress}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6 shadow-sm flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100">
          {t("explorer:minerDistribution.title")}
        </h3>
        <MinerRangeTabs value={range} onChange={setRange} />
      </div>
      <p className="text-[10px] text-slate-400 dark:text-gray-400 mt-0.5 mb-4">
        {t(MINER_SUBTITLE_KEYS[range])}
      </p>
      {distribution !== null && !isLoading && (
        <MinerIndexNotice distribution={distribution} />
      )}
      {body}
      <ShareBar data={isLoading ? null : distribution} />
    </div>
  );
}
