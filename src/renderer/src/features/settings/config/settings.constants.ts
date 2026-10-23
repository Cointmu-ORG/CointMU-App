import ms from "ms";

export const SECURITY_SETTINGS_KEY = "security";
export const ADVANCED_SETTINGS_KEY = "advanced";
export const AUTO_HIDE_SECONDS = 30;
export const RESET_CONFIRM_WORD = "RESET";
export const CONNECT_FEEDBACK_MS = 1500;
export const MINING_DEBOUNCE_DELAY_MS = 800;
export const MAX_CORES = navigator.hardwareConcurrency || 8;
export const UPTIME_REFRESH_MS = ms("1m");

export const NETWORK_OPTIONS = [
  "CointMU Mainnet · chain ID 1912",
  "CointMU Testnet · chain ID 7013",
  "Localhost 8545",
];

export const MAX_PEERS_OPTIONS = [
  { label: "10", value: 10 },
  { label: "14 (recommended)", value: 14 },
  { label: "25", value: 25 },
  { label: "50", value: 50 },
];

export const SYNC_MODE_OPTIONS = ["Snap (recommended)", "Full", "Light"];

export const MINING_MODE_OPTIONS = ["Solo", "campuspool.cmu", "Custom pool..."];

export const LANGUAGE_OPTIONS = [
  { label: "English", value: "en" },
  { label: "Bahasa Indonesia", value: "id" },
  { label: "Español", value: "es" },
  { label: "中文", value: "zh" },
  { label: "Русский", value: "ru" },
  { label: "Deutsch", value: "de" },
  { label: "日本語", value: "ja" },
];

export const CURRENCY_OPTIONS = ["CMU (native)", "USD ($)", "EUR (€)"];

export const COLORS = [
  { id: "#3b82f6", color: "bg-blue-500", name: "blue" },
  { id: "#10b981", color: "bg-emerald-500", name: "emerald" },
  { id: "#6366f1", color: "bg-indigo-500", name: "indigo" },
  { id: "#a855f7", color: "bg-purple-500", name: "purple" },
  { id: "#f59e0b", color: "bg-amber-500", name: "amber" },
  { id: "#ef4444", color: "bg-red-500", name: "red" },
];

export const LOG_LEVELS = ["Info", "Debug", "Warn", "Error"];

export const CONNECTED_SITES_SETTINGS_KEY = "connectedSites";
