import { useNotificationStore } from "@/entities/notification";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";

interface ToggleRowProps {
  title: string;
  description: string;
  value: boolean;
  onChange: () => void;
}

/**
 * A single labeled toggle row using the shared pill-switch styling.
 * @param props - The label, description, current value, and change handler.
 * @returns The rendered toggle row.
 */
function ToggleRow({
  title,
  description,
  value,
  onChange,
}: ToggleRowProps): JSX.Element {
  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <p className="text-sm font-bold text-slate-800 dark:text-white">
          {title}
        </p>
        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
          {description}
        </p>
      </div>
      <button
        onClick={onChange}
        className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${value ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700"}`}
      >
        <div
          className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${value ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}

/**
 * Notifications settings pane. Self-contained: reads preferences from the
 * notification store and persists changes through its updateSettings action.
 * @returns The Notifications settings form component.
 */
export function NotificationSettings(): JSX.Element {
  const { t } = useTranslation();
  const settings = useNotificationStore((s) => s.settings);
  const updateSettings = useNotificationStore((s) => s.updateSettings);

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 dark:text-white mb-6">
        {t("settings:notifications.subtitle")}
      </h2>

      <div className="space-y-8">
        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:notifications.delivery")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <ToggleRow
              title={t("settings:notifications.globalTitle")}
              description={t("settings:notifications.globalDesc")}
              value={settings.global}
              onChange={() => updateSettings({ global: !settings.global })}
            />
            <ToggleRow
              title={t("settings:notifications.desktopTitle")}
              description={t("settings:notifications.desktopDesc")}
              value={settings.desktopOs}
              onChange={() =>
                updateSettings({ desktopOs: !settings.desktopOs })
              }
            />
            <ToggleRow
              title={t("settings:notifications.soundTitle")}
              description={t("settings:notifications.soundDesc")}
              value={settings.sound}
              onChange={() => updateSettings({ sound: !settings.sound })}
            />
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:notifications.eventCategories")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <ToggleRow
              title={t("settings:notifications.txTitle")}
              description={t("settings:notifications.txDesc")}
              value={settings.transactions}
              onChange={() =>
                updateSettings({ transactions: !settings.transactions })
              }
            />
            <ToggleRow
              title={t("settings:notifications.miningTitle")}
              description={t("settings:notifications.miningDesc")}
              value={settings.mining}
              onChange={() => updateSettings({ mining: !settings.mining })}
            />
            <ToggleRow
              title={t("settings:notifications.securityTitle")}
              description={t("settings:notifications.securityDesc")}
              value={settings.security}
              onChange={() => updateSettings({ security: !settings.security })}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
