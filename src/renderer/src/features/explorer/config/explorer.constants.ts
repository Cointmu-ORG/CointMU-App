import ms from "ms";

export const WEI_PER_CMU = BigInt("1000000000000000000");
export const BLOCK_REWARD_CMU = 2;
export const EXPLORER_TX_PAGE_SIZE = 10;
export const EMPTY_STAT_LABEL = "--";
export const INSIGHTS_POLL_INTERVAL_MS = ms("3s");
export const EXPLORER_VIEW_TICK_INTERVAL_MS = ms("5s");
export const CHAIN_TIMELINE_TICK_INTERVAL_MS = ms("1s");
/** Blocks per insights payload; mirrors INSIGHTS_BLOCK_WINDOW in main/services/activityScanner.ts. */
export const CHAIN_TIMELINE_BLOCK_COUNT = 12;

export const ADDRESS_TX_PAGE_SIZE = 8;
export const MOCK_USD_RATE = 0.42;
export const MS_PER_WEEK = ms("7d");

export const MINER_POLL_INTERVAL_MS = 60_000;
export const BAR_COLORS = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
];
export const BAR_SEGMENT_COLORS = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
];

export const ASCII_PRINTABLE_MIN = 0;
export const ASCII_PRINTABLE_MAX = 127;
export const HEX_RADIX = 16;
export const HEX_CHARS_PER_BYTE = 2;

export const ADDRESS_LENGTH = 42;
export const HASH_LENGTH = 66;
export const WEI_PER_GWEI = 1e9;
