import { useNotificationStore } from "@/entities/notification";
import { useState, useEffect, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { type SettingsStore } from "@/features/settings";
import { GeneralSettings } from "@/features/settings";
import { AppearanceSettings } from "@/features/settings";
import { NetworkSettings } from "@/features/settings";
import { MiningSettings } from "@/features/settings";
import { SecuritySettings } from "@/features/settings";
import { ConnectedSitesSettings } from "@/features/settings";
import { ExternalSourceSettings } from "@/features/settings";
import { AdvancedSettings } from "@/features/settings";
import { AboutSettings } from "@/features/settings";
import { NotificationSettings } from "@/features/settings";
import { resetAllSettings } from "@/features/settings";
import { getAllSettings, setSetting } from "@/shared/api";
import { useAppearanceStore } from "@/features/settings";
import { ErrorReportingSettings } from "@/features/error-reporting";
import {
  Sun,
  Image,
  Zap,
  Layers,
  Lock,
  Settings,
  Box,
  Bell,
  Globe,
  Download,
  ShieldCheck,
} from "lucide-react";

export type SettingsCategory =
  | "general"
  | "appearance"
  | "notifications"
  | "network"
  | "mining"
  | "security"
  | "connectedSites"
  | "externalSources"
  | "advanced"
  | "privacy"
  | "about";

const CATEGORIES: { id: SettingsCategory; label: string; icon: JSX.Element }[] =
  [
    {
      id: "general",
      label: "General",
      icon: <Sun width={16} height={16} strokeWidth={2.5} />,
    },
    {
      id: "appearance",
      label: "Appearance",
      icon: <Image width={16} height={16} />,
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: <Bell width={16} height={16} />,
    },
    {
      id: "network",
      label: "Network",
      icon: <Zap width={16} height={16} strokeWidth={2.5} />,
    },
    {
      id: "mining",
      label: "Mining",
      icon: <Layers width={16} height={16} />,
    },
    {
      id: "security",
      label: "Security",
      icon: <Lock width={16} height={16} />,
    },
    {
      id: "connectedSites",
      label: "Connected Sites",
      icon: <Globe width={16} height={16} />,
    },
    {
      id: "externalSources",
      label: "External Sources",
      icon: <Download width={16} height={16} />,
    },
    {
      id: "advanced",
      label: "Advanced",
      icon: <Settings width={16} height={16} />,
    },
    {
      id: "privacy",
      label: "Privacy & Diagnostics",
      icon: <ShieldCheck width={16} height={16} />,
    },
    {
      id: "about",
      label: "About",
      icon: <Box width={16} height={16} />,
    },
  ];

interface SettingsProps {
  initialCategory?: SettingsCategory;
}

/**
 * Main Settings view orchestrating the split-pane layout for configuration.
 * Handles loading initial state from electron-store via IPC and provides an
 * updater function to sub-components to persist changes immediately.
 * @param props - Settings configuration.
 * @returns The Settings interface with left navigation and right content area.
 */
function SettingsPage({
  initialCategory = "general",
}: SettingsProps = {}): JSX.Element {
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategory>(initialCategory);
  const [settings, setSettings] = useState<SettingsStore | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const { t, i18n } = useTranslation(["common", "settings"]);

  useEffect(() => {
    // Load initial settings from the Electron main process via preload bridge
    const loadSettings = async () => {
      try {
        const data = await getAllSettings();
        setSettings(data as SettingsStore);
      } catch (err) {
        console.error("Failed to load settings from electron-store", err);
      }
    };
    loadSettings();
  }, []);

  const updateSetting = async (
    section: keyof SettingsStore,
    key: string,
    value: any,
  ) => {
    if (!settings) return;

    // Optimistic UI update
    const updatedSettings = {
      ...settings,
      [section]: {
        ...(settings[section] as any),
        [key]: value,
      },
    };
    setSettings(updatedSettings);

    // Persist to electron-store (e.g. key: 'general.launchAtLogin')
    try {
      await setSetting(`${section}.${key}`, value);
    } catch (err) {
      console.error(`Failed to save setting ${section}.${key}`, err);
      // Revert if necessary, but omitting for simplicity in this implementation
    }
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="w-6 h-6 rounded-full border-2 border-slate-300 border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">
      <header className="flex items-center justify-between px-8 py-4 border-b border-slate-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-widest uppercase text-slate-400">
            {t("settings:system")}
          </span>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-800 dark:text-gray-100">
            {t("sidebar.settings")}
          </span>
        </div>

        <button
          onClick={() => setIsResetModalOpen(true)}
          className="text-xs font-semibold text-slate-700 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100 transition-colors"
        >
          {t("settings:resetToDefaults")}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar Navigation */}
        <div className="w-56 flex-shrink-0 border-r border-slate-200 dark:border-gray-800 bg-slate-50/50 dark:bg-gray-950 p-4 space-y-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm font-medium transition-all duration-150 ${
                activeCategory === cat.id
                  ? "bg-white dark:bg-gray-800 text-accent shadow-sm border border-slate-200/60 dark:border-gray-700"
                  : "text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 hover:text-slate-800 dark:hover:text-gray-100 border border-transparent"
              }`}
            >
              <div
                className={`${activeCategory === cat.id ? "text-accent" : "text-slate-400"}`}
              >
                {cat.icon}
              </div>
              {t(`settings:${cat.id}.title`)}
            </button>
          ))}
        </div>

        {/* Right Content Area */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-950 p-8">
          <div key={resetVersion} className="max-w-3xl">
            {activeCategory === "general" && (
              <GeneralSettings
                config={settings.general}
                onUpdate={(k, v) => updateSetting("general", k, v)}
              />
            )}
            {activeCategory === "appearance" && <AppearanceSettings />}
            {activeCategory === "notifications" && <NotificationSettings />}
            {activeCategory === "network" && (
              <NetworkSettings
                config={settings.network}
                onUpdate={(k, v) => updateSetting("network", k, v)}
              />
            )}
            {activeCategory === "mining" && (
              <MiningSettings
                config={settings.mining}
                accounts={settings.accounts}
                onUpdate={(k, v) => updateSetting("mining", k, v)}
              />
            )}
            {activeCategory === "security" && <SecuritySettings />}
            {activeCategory === "connectedSites" && <ConnectedSitesSettings />}
            {activeCategory === "externalSources" && <ExternalSourceSettings />}
            {activeCategory === "advanced" && <AdvancedSettings />}
            {activeCategory === "privacy" && <ErrorReportingSettings />}
            {activeCategory === "about" && <AboutSettings />}
          </div>
        </div>
      </div>
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-gray-800 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-slate-800 dark:text-gray-100 mb-2">
              {t("settings:resetModal.title")}
            </h3>
            <p className="text-sm text-slate-600 dark:text-gray-400 mb-6 leading-relaxed">
              {t("settings:resetModal.description")}
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                {t("settings:resetModal.cancel")}
              </button>
              <button
                onClick={async () => {
                  await resetAllSettings();
                  useAppearanceStore.getState().resetToDefaults();

                  useNotificationStore.getState().clearAll();
                  useNotificationStore.setState({ hydrated: false });
                  await useNotificationStore.getState().hydrate();
                  localStorage.removeItem("appLanguage");
                  i18n.changeLanguage("en");
                  const freshSettings = await getAllSettings();
                  setSettings(freshSettings as SettingsStore);
                  setResetVersion((v) => v + 1);
                  setIsResetModalOpen(false);
                }}
                className="px-4 py-2 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors shadow-sm shadow-red-500/20"
              >
                {t("settings:resetModal.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { SettingsPage };
