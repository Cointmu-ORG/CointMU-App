import { CURRENCY_OPTIONS } from "../config/settings.constants";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsStore } from "@/features/settings";
import { LanguageSwitcher } from "./language-switcher.component";
import { CustomDropdown } from "@/shared/ui";
import { CURRENCY_LABEL_KEYS } from "@/shared/lib";
import { DisplayCurrency } from "@bridge/setting-values";

interface GeneralSettingsProps {
  config: SettingsStore["general"];
  onUpdate: (key: string, value: any) => void;
}

/**
 * General settings pane containing startup behaviors, notifications, and
 * display localization preferences.
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
        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:general.startup")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:general.launchTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:general.launchDesc")}
                </p>
              </div>
              <button
                onClick={() => onUpdate("launchAtLogin", !config.launchAtLogin)}
                className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${config.launchAtLogin ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700"}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.launchAtLogin ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:general.backgroundTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:general.backgroundDesc")}
                </p>
              </div>
              <button
                onClick={() =>
                  onUpdate("openInBackground", !config.openInBackground)
                }
                className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${config.openInBackground ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700"}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.openInBackground ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:general.display")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <LanguageSwitcher />
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:general.currencyTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:general.currencyDesc")}
                </p>
              </div>
              <div className="w-48">
                <CustomDropdown<DisplayCurrency>
                  options={CURRENCY_OPTIONS}
                  selected={config.currency}
                  onSelect={(val) => onUpdate("currency", val)}
                  renderSelected={(selected) =>
                    t(CURRENCY_LABEL_KEYS[selected ?? DisplayCurrency.CMU])
                  }
                  renderOption={(option) => t(CURRENCY_LABEL_KEYS[option])}
                  compact
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
