import { INTENSITY_OPTIONS } from "../config/mining.constants";
import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/shared/ui";
import { generateIdenticonGradient } from "@/features/wallet";

interface WorkerConfigurationProps {
  cpuThreads: number;
  maxCores: number;
  intensity: string;
  rewardAddress: string;
}

/**
 * Read-only summary of the internal node worker configuration: allocated worker
 * threads, mining intensity, and the reward address that receives block rewards.
 * @param props - Thread allocation, core count, intensity, and reward address.
 * @returns The rendered worker configuration card.
 */
function WorkerConfiguration({
  cpuThreads,
  maxCores,
  intensity,
  rewardAddress,
}: WorkerConfigurationProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <Card>
      <div className="mb-1">
        <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100">
          {t("mining:worker.title")}
        </h3>
        <p className="text-[10px] text-slate-400 dark:text-gray-400 mt-0.5">
          {t("mining:worker.subtitle")}
        </p>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-gray-800 mt-4 opacity-80 pointer-events-none">
        <div className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">
              {t("mining:worker.workerThreads")}
            </p>
            <p className="text-xs text-slate-400 dark:text-gray-400 mt-0.5">
              {t("mining:worker.ofCores", {
                threads: cpuThreads,
                count: maxCores,
              })}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {Array.from({ length: maxCores }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-6 rounded-sm cursor-default ${i < cpuThreads ? "bg-emerald-400" : "bg-slate-200 dark:bg-gray-800"}`}
                title={t("mining:worker.threadTitle", { count: i + 1 })}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">
              {t("mining:worker.intensityTitle")}
            </p>
            <p className="text-xs text-slate-400 dark:text-gray-400 mt-0.5 max-w-[140px]">
              {t("mining:worker.higherMoreHeat")}
            </p>
          </div>
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-gray-700 overflow-hidden">
            {INTENSITY_OPTIONS.map((option) => (
              <div
                key={option}
                className={`px-3.5 py-1.5 text-xs font-semibold cursor-default transition-colors ${
                  intensity === option
                    ? "bg-slate-300 dark:bg-gray-700 text-slate-700 dark:text-gray-100"
                    : "bg-white dark:bg-gray-800 text-slate-400 dark:text-gray-400"
                }`}
              >
                {option}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">
              {t("mining:worker.rewardAddressTitle")}
            </p>
            <p className="text-xs text-slate-400 dark:text-gray-400 mt-0.5">
              {t("mining:worker.blockRewardsCreditedHere")}
            </p>
          </div>
          {rewardAddress ? (
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full bg-gradient-to-br ${generateIdenticonGradient(rewardAddress)} flex-shrink-0`}
              />
              <span className="text-xs font-mono text-slate-500 dark:text-gray-400 font-medium tracking-tight">
                {rewardAddress.substring(0, 10)}...
                {rewardAddress.substring(rewardAddress.length - 8)}
              </span>
            </div>
          ) : (
            <span className="text-xs font-medium text-slate-400">
              {t("mining:worker.setInMiningSettings")}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

export { WorkerConfiguration };
export type { WorkerConfigurationProps };
