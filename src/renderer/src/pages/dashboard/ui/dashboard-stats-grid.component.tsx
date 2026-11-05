import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Activity, ChevronRight, Grid, Globe, Link } from "lucide-react";
import { PrivateAmount } from "@/shared/ui";

interface DashboardStatsGridProps {
  isConnected: boolean;
  miningLabel: string;
  miningUptimeLabel: string;
  minedBlocksCount: number;
  hashrateDisplay: string;
  smartContractsCount: number;
  onNavigate: (view: string) => void;
}

/**
 * Four-column KPI grid summarizing the user's mining status, mined blocks over
 * the last day, the network hashrate, and deployed smart contracts.
 * @param props - Connection state and the formatted KPI display values.
 * @returns The rendered dashboard stats grid.
 */
function DashboardStatsGrid({
  isConnected,
  miningLabel,
  miningUptimeLabel,
  minedBlocksCount,
  hashrateDisplay,
  smartContractsCount,
  onNavigate,
}: DashboardStatsGridProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-4 gap-5">
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <Activity className="text-accent w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-medium text-slate-500">
              {t("dashboard:statsGrid.yourMining")}
            </span>
          </div>
          <button
            onClick={() => onNavigate("miner")}
            className="text-[11px] font-semibold text-accent hover:opacity-80 transition-opacity flex items-center gap-0.5"
          >
            {t("dashboard:statsGrid.open")}
            <ChevronRight className="w-2.5 h-2.5" strokeWidth={3} />
          </button>
        </div>
        <p className="text-2xl font-bold text-slate-800 dark:text-gray-100 tracking-tight">
          {miningLabel}
        </p>
        <p className="text-xs text-slate-400 mt-1">{miningUptimeLabel}</p>
      </div>

      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-gray-800 flex items-center justify-center">
            <Grid className="text-emerald-500 w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-medium text-slate-500">
            {t("dashboard:statsGrid.minedBlocks")}
          </span>
        </div>
        <p className="text-2xl font-bold text-slate-800 dark:text-gray-100 tracking-tight">
          {isConnected ? minedBlocksCount : "0"}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {isConnected ? (
            <>
              <PrivateAmount>{`+${minedBlocksCount * 2}`}</PrivateAmount>
              {` CMU ${t("dashboard:statsGrid.rewards")}`}
            </>
          ) : (
            "--"
          )}
        </p>
      </div>

      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-gray-800 flex items-center justify-center">
            <Globe className="text-violet-500 w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-medium text-slate-500">
            {t("dashboard:statsGrid.networkHashrate")}
          </span>
        </div>
        <p className="text-2xl font-bold text-slate-800 dark:text-gray-100 tracking-tight">
          {hashrateDisplay}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {isConnected ? t("dashboard:statsGrid.realTimeRpc") : "--"}
        </p>
      </div>

      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-gray-800 flex items-center justify-center">
            <Link className="text-amber-500 w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-medium text-slate-500">
            {t("dashboard:statsGrid.smartContracts")}
          </span>
        </div>
        <p className="text-2xl font-bold text-slate-800 dark:text-gray-100 tracking-tight">
          {isConnected ? smartContractsCount : "0"}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {isConnected
            ? `${smartContractsCount} ${t("dashboard:statsGrid.deployedByYou")}`
            : "--"}
        </p>
      </div>
    </div>
  );
}

export { DashboardStatsGrid };
export type { DashboardStatsGridProps };
