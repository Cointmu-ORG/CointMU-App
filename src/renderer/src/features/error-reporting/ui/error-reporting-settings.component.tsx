import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { LogActions } from "@/shared/ui";
import { useTelemetryState } from "../lib/telemetry-state.hook";
import { QueuedReports } from "./queued-reports.component";
import { DataBoundary, type SendStatus } from "./data-boundary.component";

const SECTION_TITLE =
  "text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3";
const CARD =
  "bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm";
const LOG_BUTTON =
  "px-3 py-1.5 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 shadow-sm transition-colors";

/**
 * Privacy & Diagnostics settings: the error reporting toggle, what is and is
 * never sent, the queue of unsent reports, and local log access.
 * @returns The settings pane.
 */
export function ErrorReportingSettings(): JSX.Element {
  const { t } = useTranslation("settings");
  const { state, isSaving, setEnabled } = useTelemetryState();
  const isEnabled = state?.isEnabled ?? false;
  const sendStatus: SendStatus =
    !state?.isAvailable || !isEnabled
      ? "off"
      : state.isNoticeAcknowledged
        ? "sending"
        : "held";

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-100 mb-6">
        {t("settings:privacy.subtitle")}
      </h2>
      <div className="space-y-8">
        <section>
          <h3 className={SECTION_TITLE}>{t("settings:privacy.reporting")}</h3>
          <div className={CARD}>
            {state && !state.isAvailable ? (
              <p className="p-4 text-xs text-slate-500 dark:text-gray-400">
                {t("settings:privacy.notConfigured")}
              </p>
            ) : (
              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p
                    id="telemetry-toggle-label"
                    className="text-sm font-bold text-slate-800 dark:text-gray-100"
                  >
                    {t("settings:privacy.toggleTitle")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                    {t("settings:privacy.toggleDesc", {
                      host: state?.collectorHost ?? "",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isEnabled}
                  aria-labelledby="telemetry-toggle-label"
                  disabled={!state || isSaving}
                  onClick={() => void setEnabled(!isEnabled)}
                  className={`w-11 h-6 shrink-0 rounded-full flex items-center transition-colors px-0.5 disabled:opacity-60 ${isEnabled ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700"}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${isEnabled ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>
            )}
            <DataBoundary
              sendStatus={sendStatus}
              collectorHost={state?.collectorHost ?? null}
            />
            {state?.isAvailable && <QueuedReports key={String(isEnabled)} />}
          </div>
        </section>

        <section>
          <h3 className={SECTION_TITLE}>{t("settings:privacy.logs")}</h3>
          <div className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-4 p-4">
              <p className="text-xs text-slate-500 dark:text-gray-400 max-w-sm">
                {t("settings:privacy.logsDesc")}
              </p>
              <div className="flex gap-2">
                <LogActions buttonClassName={LOG_BUTTON} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
