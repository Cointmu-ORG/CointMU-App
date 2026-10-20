import { useCallback, useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import type { QueuedReport } from "@bridge/types";
import {
  clearQueuedReports,
  listQueuedReports,
} from "../api/error-reporting.service";

const ACTION_BUTTON =
  "px-3 py-1.5 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 shadow-sm transition-colors disabled:opacity-60";

/**
 * Lists the reports waiting to be sent, each with the exact JSON that would be
 * sent, and lets the user delete them all.
 * @returns The queue panel.
 */
export function QueuedReports(): JSX.Element {
  const { t } = useTranslation("settings");
  const [reports, setReports] = useState<QueuedReport[] | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setReports(await listQueuedReports());
      setHasFailed(false);
    } catch (err) {
      console.error("[error-reporting] Failed to list queued reports", err);
      setHasFailed(true);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    listQueuedReports()
      .then((queued) => {
        if (isMounted) setReports(queued);
      })
      .catch((err: unknown) => {
        console.error("[error-reporting] Failed to list queued reports", err);
        if (isMounted) setHasFailed(true);
      });
    return (): void => {
      isMounted = false;
    };
  }, []);

  const handleClear = async (): Promise<void> => {
    setIsClearing(true);
    try {
      await clearQueuedReports();
    } catch (err) {
      console.error("[error-reporting] Failed to clear queued reports", err);
    } finally {
      setIsClearing(false);
      await refresh();
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
          {t("settings:privacy.queue.title", { count: reports?.length ?? 0 })}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className={ACTION_BUTTON}
          >
            {t("settings:privacy.queue.refresh")}
          </button>
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={isClearing || !reports?.length}
            className={ACTION_BUTTON}
          >
            {t("settings:privacy.queue.deleteAll")}
          </button>
        </div>
      </div>
      {hasFailed && (
        <p role="alert" className="text-xs text-red-600">
          {t("settings:privacy.queue.loadFailed")}
        </p>
      )}
      {reports === null && !hasFailed && (
        <p className="text-xs text-slate-500">
          {t("settings:advanced.loading")}
        </p>
      )}
      {reports?.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-gray-400">
          {t("settings:privacy.queue.empty")}
        </p>
      )}
      <ul className="space-y-2">
        {reports?.map((report) => (
          <li
            key={report.id}
            className="border border-slate-200 dark:border-gray-800 rounded-lg p-3"
          >
            <details>
              <summary className="cursor-pointer text-xs text-slate-700 dark:text-gray-300">
                <span className="font-mono">
                  {new Date(report.createdMs).toLocaleString()}
                </span>{" "}
                · {report.level} · {report.title}
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto text-[11px] font-mono bg-slate-50 dark:bg-gray-950 p-2 rounded whitespace-pre-wrap break-all">
                {report.payload}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
