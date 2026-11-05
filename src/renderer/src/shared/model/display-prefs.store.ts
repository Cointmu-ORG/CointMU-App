import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Clock style for times: follow the UI language, or force 12 / 24 hours. */
export const TimeFormat = {
  AUTO: "auto",
  H12: "12h",
  H24: "24h",
} as const;

export type TimeFormat = (typeof TimeFormat)[keyof typeof TimeFormat];

/** Decimals shown for CMU balances; "full" is the exact wei value. */
export const BALANCE_DECIMAL_OPTIONS = [2, 4, 6, "full"] as const;

export type BalanceDecimals = (typeof BALANCE_DECIMAL_OPTIONS)[number];

/** Display-only preferences; they never change stored or sent data. */
export interface DisplayPrefsState {
  /** Shows •••• instead of balances and amounts across the app. */
  isPrivacyMode: boolean;
  timeFormat: TimeFormat;
  balanceDecimals: BalanceDecimals;
  setPrivacyMode: (isOn: boolean) => void;
  setTimeFormat: (format: TimeFormat) => void;
  setBalanceDecimals: (decimals: BalanceDecimals) => void;
  resetDisplayPrefs: () => void;
}

const DEFAULTS = {
  isPrivacyMode: false,
  timeFormat: TimeFormat.AUTO,
  balanceDecimals: 2,
} as const satisfies Partial<DisplayPrefsState>;

export const useDisplayPrefs = create<DisplayPrefsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setPrivacyMode: (isPrivacyMode) => set({ isPrivacyMode }),
      setTimeFormat: (timeFormat) => set({ timeFormat }),
      setBalanceDecimals: (balanceDecimals) => set({ balanceDecimals }),
      resetDisplayPrefs: () => set(DEFAULTS),
    }),
    { name: "cointmu-display-prefs" },
  ),
);
