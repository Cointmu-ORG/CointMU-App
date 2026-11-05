import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Cpu } from "lucide-react";
import { cancelAutoStart } from "../api/auto-start.service";
import { useMiningAutoStartCountdown } from "../lib/mining-auto-start.hook";

/**
 * The countdown before "Start mining at launch" starts mining, with Cancel
 * (for this session only). Shown on the lock screen too: mining needs only
 * the reward address, not an unlocked wallet.
 * @returns The banner, or nothing while not counting down.
 */
export function MiningAutoStartBanner(): JSX.Element | null {
  const { t } = useTranslation();
  const seconds = useMiningAutoStartCountdown();
  const [isCancelling, setIsCancelling] = useState(false);

  if (seconds === null) return null;

  const handleCancel = (): void => {
    setIsCancelling(true);
    cancelAutoStart()
      .catch((err: unknown) => {
        console.error("Failed to cancel the mining auto-start", err);
      })
      .finally(() => setIsCancelling(false));
  };

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl shadow-lg p-4 flex gap-3"
    >
      <Cpu
        className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
        width={18}
        height={18}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
          {t("mining:autoStart.title", { seconds })}
        </p>
        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
          {t("mining:autoStart.body")}
        </p>
      </div>
      <button
        type="button"
        disabled={isCancelling}
        onClick={handleCancel}
        className="self-center px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-200 border border-slate-200 dark:border-gray-700 hover:bg-slate-100 dark:hover:bg-gray-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
      >
        {t("mining:autoStart.cancel")}
      </button>
    </div>
  );
}
