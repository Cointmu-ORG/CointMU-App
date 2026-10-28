import { COLORS } from "../config/settings.constants";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { useAppearanceStore } from "../model/appearance.store";
import { DENSITY_LABEL_KEYS } from "@/shared/lib";
import { LayoutDensity, ThemeMode } from "@bridge/setting-values";

/**
 * Appearance settings pane containing theme (light/dark/auto),
 * accent color selection, and layout density configurations.
 * @returns The Appearance Settings form component.
 */
export function AppearanceSettings(): JSX.Element {
  const { t } = useTranslation();
  const appearanceStore = useAppearanceStore();

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-100 mb-6">
        {t("settings:appearance.subtitle")}
      </h2>

      <div className="space-y-8">
        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:appearance.theme")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-4 shadow-sm flex gap-4">
            <button
              onClick={() => appearanceStore.setTheme(ThemeMode.LIGHT)}
              className={`flex-1 rounded-xl border-2 transition-all p-1 text-left ${
                appearanceStore.theme === ThemeMode.LIGHT
                  ? "border-accent bg-accent/10"
                  : "border-transparent hover:bg-slate-50 dark:hover:bg-white/5"
              }`}
            >
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden h-24 mb-3 flex">
                <div className="w-1/3 bg-slate-50 border-r border-slate-100 flex flex-col pt-3 pl-3">
                  <div className="w-4 h-1 rounded-full bg-accent mb-1" />
                  <div className="w-8 h-1 rounded-full bg-slate-300 mb-0.5" />
                  <div className="w-6 h-1 rounded-full bg-slate-200" />
                </div>
                <div className="flex-1 bg-white p-3">
                  <div className="w-12 h-2 rounded-full bg-slate-100 mb-2" />
                  <div className="w-8 h-1 rounded-full bg-slate-100" />
                </div>
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-gray-100 px-2">
                {t("settings:appearance.themeLight")}
              </span>
            </button>

            <button
              onClick={() => appearanceStore.setTheme(ThemeMode.DARK)}
              className={`flex-1 rounded-xl border-2 transition-all p-1 text-left ${
                appearanceStore.theme === ThemeMode.DARK
                  ? "border-accent bg-accent/10"
                  : "border-transparent hover:bg-slate-50 dark:hover:bg-white/5"
              }`}
            >
              <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden h-24 mb-3 flex">
                <div className="w-1/3 bg-slate-800 border-r border-slate-700 flex flex-col pt-3 pl-3">
                  <div className="w-4 h-1 rounded-full bg-accent mb-1" />
                  <div className="w-8 h-1 rounded-full bg-slate-600 mb-0.5" />
                  <div className="w-6 h-1 rounded-full bg-slate-700" />
                </div>
                <div className="flex-1 bg-slate-900 p-3">
                  <div className="w-12 h-2 rounded-full bg-slate-800 mb-2" />
                  <div className="w-8 h-1 rounded-full bg-slate-800" />
                </div>
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-gray-100 px-2">
                {t("settings:appearance.themeDark")}
              </span>
            </button>

            <button
              onClick={() => appearanceStore.setTheme(ThemeMode.AUTO)}
              className={`flex-1 rounded-xl border-2 transition-all p-1 text-left ${
                appearanceStore.theme === ThemeMode.AUTO
                  ? "border-accent bg-accent/10"
                  : "border-transparent hover:bg-slate-50 dark:hover:bg-white/5"
              }`}
            >
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 overflow-hidden h-24 mb-3 flex relative">
                <div className="absolute inset-0 flex">
                  <div className="flex-1 bg-white dark:bg-gray-800" />
                  <div className="flex-1 bg-slate-900" />
                </div>
                {/* Diagonal cut abstraction */}
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute top-0 right-0 w-full h-full bg-slate-900 origin-bottom-right transform -skew-x-12 translate-x-1/4" />
                </div>
                <div className="relative z-10 w-1/3 bg-slate-50 border-r border-slate-200/50 flex flex-col pt-3 pl-3">
                  <div className="w-4 h-1 rounded-full bg-accent mb-1" />
                  <div className="w-8 h-1 rounded-full bg-slate-300 mb-0.5" />
                  <div className="w-6 h-1 rounded-full bg-slate-200 dark:bg-gray-700" />
                </div>
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-gray-100 px-2">
                {t("settings:appearance.themeAuto")}
              </span>
            </button>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:appearance.accentColor")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-4 shadow-sm flex items-center gap-3">
            {COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => appearanceStore.setAccentColor(c.id)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  appearanceStore.accentColor === c.id
                    ? "ring-2 ring-offset-2 ring-accent scale-110"
                    : "hover:scale-110"
                }`}
              >
                <div
                  className="w-full h-full rounded-full"
                  style={{ backgroundColor: c.id }}
                />
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:appearance.layout")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:appearance.densityTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:appearance.densityDesc")}
                </p>
              </div>
              <div className="flex items-center bg-slate-100 dark:bg-black/20 rounded-lg p-1">
                {Object.values(LayoutDensity).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => appearanceStore.setDensity(opt)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                      appearanceStore.density === opt
                        ? "bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 shadow-sm"
                        : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-100"
                    }`}
                  >
                    {t(DENSITY_LABEL_KEYS[opt])}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:appearance.showSidebarColorsTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:appearance.showSidebarColorsDesc")}
                </p>
              </div>
              <button
                onClick={() =>
                  appearanceStore.setShowSidebarColors(
                    !appearanceStore.showSidebarColors,
                  )
                }
                className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${appearanceStore.showSidebarColors ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${appearanceStore.showSidebarColors ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:appearance.animatedTransitionsTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:appearance.animatedTransitionsDesc")}
                </p>
              </div>
              <button
                onClick={() =>
                  appearanceStore.setAnimatedTransitions(
                    !appearanceStore.animatedTransitions,
                  )
                }
                className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${appearanceStore.animatedTransitions ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${appearanceStore.animatedTransitions ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
