import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsStore } from "@/features/settings";
import { LanguageSwitcher } from "./language-switcher.component";
import { WindowSettings } from "./window-settings.component";

// Login items exist on Windows and macOS; only the Windows entry can carry
// the argument that starts the app minimized (main/app/loginItem.ts).
const OS = window.systemInfo?.os;
const CAN_LAUNCH_AT_LOGIN = OS === "win32" || OS === "darwin";
const CAN_OPEN_IN_BACKGROUND = OS === "win32";

interface GeneralSettingsProps {
  config: SettingsStore["general"];
  onUpdate: (key: string, value: any) => void;
}

interface ToggleRowProps {
  title: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}

function ToggleRow({
  title,
  description,
  value,
  onToggle,
}: ToggleRowProps): JSX.Element {
  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
          {title}
        </p>
        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
          {description}
        </p>
      </div>
      <button
        onClick={onToggle}
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
 * General settings pane: the startup behaviors the OS supports (none on
 * Linux), the close button and the display language.
 * @param props The configuration state and the update callback.
 * @returns The General Settings form component.
 */
export function GeneralSettings({
  config,
  onUpdate,
}: GeneralSettingsProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-100 mb-6">
        {t("settings:general.subtitle")}
      </h2>

      <div className="space-y-8">
        {CAN_LAUNCH_AT_LOGIN && (
          <section>
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
              {t("settings:general.startup")}
            </h3>
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
              <ToggleRow
                title={t("settings:general.launchTitle")}
                description={t("settings:general.launchDesc")}
                value={config.launchAtLogin}
                onToggle={() =>
                  onUpdate("launchAtLogin", !config.launchAtLogin)
                }
              />
              {CAN_OPEN_IN_BACKGROUND && (
                <ToggleRow
                  title={t("settings:general.backgroundTitle")}
                  description={t("settings:general.backgroundDesc")}
                  value={config.openInBackground}
                  onToggle={() =>
                    onUpdate("openInBackground", !config.openInBackground)
                  }
                />
              )}
            </div>
          </section>
        )}

        <WindowSettings closeAction={config.closeAction} onUpdate={onUpdate} />

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:general.display")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <LanguageSwitcher />
          </div>
        </section>
      </div>
    </div>
  );
}
