import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { ExplorerIndexPhase } from "@bridge/types";
import type { MinerDistribution } from "@/entities/miner";

interface MinerIndexNoticeProps {
  distribution: MinerDistribution;
}

/**
 * Says when the distribution is not the whole story: the block index is still
 * backfilling the range (with its progress), or the node is unreachable and
 * the card shows what was indexed before. Renders nothing for complete data.
 * @param props - The distribution whose coverage to describe.
 * @returns The notice, or null.
 */
export function MinerIndexNotice({
  distribution,
}: MinerIndexNoticeProps): JSX.Element | null {
  const { t, i18n } = useTranslation();
  const { isComplete, progress } = distribution;
  const isUnreachable = progress.phase === ExplorerIndexPhase.NODE_UNREACHABLE;
  if (isComplete && !isUnreachable) return null;

  const percent = Math.floor(progress.percent);
  const message = isUnreachable
    ? t("explorer:minerDistribution.nodeUnreachable", {
        block: (progress.highestBlock ?? 0).toLocaleString(i18n.language),
      })
    : t("explorer:minerDistribution.indexing", { percent });

  return (
    <div className="mb-4" role="status">
      <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
        {message}
      </p>
      {!isComplete && (
        <div
          role="progressbar"
          aria-label={t("explorer:minerDistribution.progressLabel")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-1.5 h-1 w-full bg-slate-100 dark:bg-gray-800 rounded-full overflow-hidden"
        >
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-500"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
