import { SECURITY_SETTINGS_KEY } from "../config/settings.constants";
import { create } from "zustand";
import type { AutoLockMinutes } from "@bridge/setting-values";
import { getSetting, setSetting } from "@/shared/api";

export interface SecuritySettings {
  /** Lock the wallet after this many idle minutes; 0 is Never. */
  autoLockMinutes: AutoLockMinutes;
  /** Ask for the wallet password before every send. */
  confirmPasswordOnSend: boolean;
  requireBiometrics: boolean;
}

interface SecurityStore {
  settings: SecuritySettings;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  updateSettings: (newSettings: Partial<SecuritySettings>) => void;
}

const DEFAULT_SETTINGS: SecuritySettings = {
  autoLockMinutes: 15,
  confirmPasswordOnSend: true,
  requireBiometrics: false,
};

/**
 * Persists the security settings to electron-store, swallowing write errors so
 * a storage failure never breaks the in-memory preference flow.
 * @param settings - The current security settings to persist.
 * @returns Nothing.
 */
function persistSettings(settings: SecuritySettings): void {
  void setSetting(SECURITY_SETTINGS_KEY, settings).catch((err) => {
    console.error("Failed to persist security settings", err);
  });
}

/**
 * Global security preferences store. Mirrors the notification store pattern:
 * settings are hydrated from electron-store on startup and mirrored back on
 * every mutation so the auto-lock choice survives restarts. requireBiometrics
 * has no control yet (#104) and is carried through unchanged.
 */
export const useSecurityStore = create<SecurityStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const stored = await getSetting<Partial<SecuritySettings> | null>(
        SECURITY_SETTINGS_KEY,
      );
      set({
        settings: { ...DEFAULT_SETTINGS, ...(stored ?? {}) },
        hydrated: true,
      });
    } catch (err) {
      console.error("Failed to hydrate security store", err);
      set({ hydrated: true });
    }
  },
  updateSettings: (newSettings: Partial<SecuritySettings>) => {
    set((state) => {
      const settings = { ...state.settings, ...newSettings };
      persistSettings(settings);
      return { settings };
    });
  },
}));
