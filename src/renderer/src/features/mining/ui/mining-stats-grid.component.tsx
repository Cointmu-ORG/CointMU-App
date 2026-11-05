import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Sparkline, PrivateAmount } from "@/shared/ui";
import { StatCard } from "./stat-card.component";

interface MiningStatsGridProps {
  elapsedTime: string;
  isMining: boolean;
  blocksFoundToday: number;
  balance: string;
  hashrateLabel: string;
  hashrateHistory: number[];
}

/**
 * Four-column KPI grid summarizing the mining session: elapsed time, blocks
 * found today, total earned, and the recent hashrate with a sparkline.
 * @param props - Session time, mining flag, block count, balance, hashrate, and
 * the recent hashrate history feeding the sparkline.
 * @returns The rendered stats grid.
 */
function MiningStatsGrid({
  elapsedTime,
  isMining,
  blocksFoundToday,
  balance,
  hashrateLabel,
  hashrateHistory,
}: MiningStatsGridProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-4 gap-5">
      <StatCard
        label={t("mining:stats.sessionTime")}
        value={elapsedTime}
        hint={isMining ? t("mining:stats.active") : t("mining:stats.idle")}
        valueClassName="font-mono"
      />
      <StatCard
        label={t("mining:stats.blocksFound")}
        value={blocksFoundToday}
        hint={t("mining:stats.past24Hours")}
      />
      <StatCard
        label={t("mining:stats.totalEarned")}
        value={
          <>
            <PrivateAmount>+{balance}</PrivateAmount>
            <span className="text-sm font-medium text-slate-400 ml-1.5">
              CMU
            </span>
          </>
        }
        hint={t("mining:stats.acrossThisWallet")}
        valueClassName="text-emerald-600"
      />
      <StatCard
        label={t("mining:stats.hashrate5Min")}
        action={
          <Badge tone={isMining ? "success" : "neutral"}>
            {isMining ? t("mining:stats.stable") : t("mining:stats.idle")}
          </Badge>
        }
        value={isMining ? `${hashrateLabel} MH/s` : "0.00 MH/s"}
        valueClassName="font-mono"
        hint={
          <span className="block mt-2 h-10">
            <Sparkline
              data={hashrateHistory}
              className="w-full h-full"
              color={isMining ? "#10b981" : "#cbd5e1"}
            />
          </span>
        }
      />
    </div>
  );
}

export { MiningStatsGrid };
export type { MiningStatsGridProps };
