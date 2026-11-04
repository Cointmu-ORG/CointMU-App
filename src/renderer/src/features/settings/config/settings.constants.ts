import ms from "ms";
import { LogLevel } from "@bridge/setting-values";

export const SECURITY_SETTINGS_KEY = "security";
export const ADVANCED_SETTINGS_KEY = "advanced";
export const AUTO_HIDE_SECONDS = 30;
export const RESET_CONFIRM_WORD = "RESET";
export const MINING_DEBOUNCE_DELAY_MS = 800;
export const MAX_CORES = navigator.hardwareConcurrency || 8;
export const UPTIME_REFRESH_MS = ms("1m");

export const MAX_PEERS_OPTIONS = [10, 14, 25, 50];
export const RECOMMENDED_MAX_PEERS = 14;

export const LANGUAGE_OPTIONS = [
  { label: "English", value: "en" },
  { label: "Bahasa Indonesia", value: "id" },
  { label: "Español", value: "es" },
  { label: "中文", value: "zh" },
  { label: "Русский", value: "ru" },
  { label: "Deutsch", value: "de" },
  { label: "日本語", value: "ja" },
];

export const COLORS = [
  { id: "#3b82f6", color: "bg-blue-500", name: "blue" },
  { id: "#10b981", color: "bg-emerald-500", name: "emerald" },
  { id: "#6366f1", color: "bg-indigo-500", name: "indigo" },
  { id: "#a855f7", color: "bg-purple-500", name: "purple" },
  { id: "#f59e0b", color: "bg-amber-500", name: "amber" },
  { id: "#ef4444", color: "bg-red-500", name: "red" },
];

// geth stays at info or above: the app reads its INFO lines (mining log, DAG
// progress, recovery), so Warning and Error are not offered.
export type NodeLogLevel = typeof LogLevel.INFO | typeof LogLevel.DEBUG;
export const LOG_LEVELS: NodeLogLevel[] = [LogLevel.INFO, LogLevel.DEBUG];

export const CONNECTED_SITES_SETTINGS_KEY = "connectedSites";
