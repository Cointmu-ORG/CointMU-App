import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { useTelemetryState } from "../lib/telemetry-state.hook";

const BUTTON_BASE =
  "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

/**
 * One-time notice explaining error reporting (what is sent, where, how to turn
 * it off). Reports are queued but not sent until it is dismissed either way.
 * @returns The notice, or null when it was already seen or reporting is not configured.
 */
export function FirstRunNotice(): JSX.Element | null {
  const { t } = useTranslation("settings");
  const { state, isSaving, setEnabled, acknowledge } = useTelemetryState();
  if (!state?.isAvailable || state.isNoticeAcknowledged) return null;

  const handleTurnOff = async (): Promise<void> => {
    await setEnabled(false);
    await acknowledge();
  };

  return (
    <section
      role="region"
      aria-labelledby="telemetry-notice-title"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-50 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl shadow-xl p-5 text-slate-700 dark:text-gray-300"
    >
      <h2
        id="telemetry-notice-title"
        className="text-sm font-bold text-slate-900 dark:text-gray-100 mb-2"
      >
        {t("settings:privacy.notice.title")}
      </h2>
      <p className="text-xs leading-relaxed mb-2">
        {t("settings:privacy.notice.what")}
      </p>
      <p className="text-xs leading-relaxed mb-2">
        {t("settings:privacy.notice.where", { host: state.collectorHost })}
      </p>
      <p className="text-xs leading-relaxed mb-4">
        {t("settings:privacy.notice.howToDisable")}
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void handleTurnOff()}
          className={`${BUTTON_BASE} text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800`}
        >
          {t("settings:privacy.notice.turnOff")}
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void acknowledge()}
          className={`${BUTTON_BASE} bg-accent text-white hover:opacity-90`}
        >
          {t("settings:privacy.notice.acknowledge")}
        </button>
      </div>
    </section>
  );
}
