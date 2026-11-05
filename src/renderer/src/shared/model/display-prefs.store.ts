import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Display-only preferences; they never change stored or sent data. */
export interface DisplayPrefsState {
  /** Shows •••• instead of balances and amounts across the app. */
  isPrivacyMode: boolean;
  setPrivacyMode: (isOn: boolean) => void;
  resetDisplayPrefs: () => void;
}

const DEFAULTS = { isPrivacyMode: false };

export const useDisplayPrefs = create<DisplayPrefsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setPrivacyMode: (isPrivacyMode) => set({ isPrivacyMode }),
      resetDisplayPrefs: () => set(DEFAULTS),
    }),
    { name: "cointmu-display-prefs" },
  ),
);
