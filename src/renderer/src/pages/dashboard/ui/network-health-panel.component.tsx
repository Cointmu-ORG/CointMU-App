import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Sparkline } from "@/shared/ui";
import { TARGET_BLOCK_TIME_SECONDS } from "../config/dashboard.constants";

interface NetworkHealthPanelProps {
  isConnected: boolean;
  blockDisplay: string;
  peerDisplay: string;
  difficultyDisplay: string;
  gasDisplay: string;
  blocksPastHour: number;
  sparklineData: number[];
}

/**
 * Network health panel summarizing chain height, peers, difficulty, suggested
 * gas, and a recent block-rate sparkbar derived from the recent block count.
 * @param props - Connection state and the formatted network metric strings.
 * @returns The rendered network health panel.
 */
function NetworkHealthPanel({
  isConnected,
  blockDisplay,
  peerDisplay,
  difficultyDisplay,
  gasDisplay,
  blocksPastHour,
  sparklineData,
}: NetworkHealthPanelProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-400"}`}
          />
          <p className="text-sm font-medium text-slate-700 dark:text-gray-100">
            {isConnected
              ? t("dashboard:networkHealth.healthy")
              : t("dashboard:networkHealth.disconnected")}
          </p>
        </div>
        <span className="text-[10px] font-semibold tracking-wide text-slate-500 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
          {t("dashboard:networkHealth.consensus", {
            seconds: TARGET_BLOCK_TIME_SECONDS,
          })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-5">
        <div>
          <p className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 mb-1">
            {t("dashboard:networkHealth.chainHeight")}
          </p>
          <p className="text-xl font-bold text-slate-800 dark:text-gray-100 font-mono">
            {blockDisplay}
          </p>
          <p className="text-[10px] text-slate-400">
            {t("dashboard:networkHealth.latestBlock")}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 mb-1">
            {t("dashboard:networkHealth.peers")}
          </p>
          <p className="text-xl font-bold text-slate-800 dark:text-gray-100 font-mono">
            {peerDisplay}
          </p>
          <p className="text-[10px] text-slate-400">
            {t("dashboard:networkHealth.gossipConnected")}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 mb-1">
            {t("dashboard:networkHealth.difficulty")}
          </p>
          <p className="text-xl font-bold text-slate-800 dark:text-gray-100 font-mono">
            {difficultyDisplay}
          </p>
          <p className="text-[10px] text-slate-400">
            {t("dashboard:networkHealth.currentNetwork")}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 mb-1">
            {t("dashboard:networkHealth.gasAvg")}
          </p>
          <p className="text-xl font-bold text-slate-800 dark:text-gray-100 font-mono">
            {gasDisplay}{" "}
            <span className="text-sm font-medium text-slate-400">gwei</span>
          </p>
          <p className="text-[10px] text-slate-400">
            {t("dashboard:networkHealth.suggestedPrice")}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-slate-50 dark:bg-gray-800 border border-slate-100 dark:border-gray-700 p-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 mb-0.5">
            {t("dashboard:networkHealth.blocksPastHour")}
          </p>
          <p className="text-2xl font-bold text-slate-800 dark:text-gray-100 font-mono">
            {isConnected ? blocksPastHour.toString() : "--"}
          </p>
        </div>
        <div className="flex items-end h-10 w-24">
          <Sparkline
            data={sparklineData}
            className="w-full h-full opacity-80"
            color="#94a3b8"
            strokeWidth={2}
          />
        </div>
      </div>
    </div>
  );
}

export { NetworkHealthPanel };
export type { NetworkHealthPanelProps };
