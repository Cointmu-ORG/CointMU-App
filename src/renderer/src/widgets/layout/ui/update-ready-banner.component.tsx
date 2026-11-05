import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import type { Updater } from "@/shared/lib";

interface UpdateReadyBannerProps {
  updater: Updater;
}

/**
 * Offers "Restart now" for a downloaded update when the install mode is Ask.
 * Restart goes through the updater's install, which stops geth first.
 * @param props - The app's updater state.
 * @returns The prompt, or nothing.
 */
export function UpdateReadyBanner({
  updater,
}: UpdateReadyBannerProps): JSX.Element | null {
  const { t } = useTranslation();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  if (
    updater.status !== "downloaded" ||
    !updater.shouldAskToInstall ||
    isDismissed
  ) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-40 max-w-sm bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl shadow-lg p-4 flex gap-3"
    >
      <Download
        className="text-accent shrink-0 mt-0.5"
        width={18}
        height={18}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
          {t("common:update.readyTitle")}
        </p>
        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
          {t("common:update.readyBody", {
            version: updater.info?.version ?? "",
          })}
        </p>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            disabled={isRestarting}
            onClick={() => {
              setIsRestarting(true);
              void updater.install();
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {t("common:update.restartNow")}
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t("common:update.later")}
          </button>
        </div>
      </div>
    </div>
  );
}
