import { ADVANCED_SETTINGS_KEY } from "../config/settings.constants";
import { create } from "zustand";
import { getSetting, setSetting } from "../api/settings.service";

export interface AdvancedSettings {
  httpRpc: boolean;
  wsRpc: boolean;
  corsOrigins: string;
  logLevel: string;
}

export interface StorageInfo {
  datadir: string;
  dbSize: number;
}

interface AdvancedStore {
  settings: AdvancedSettings;
  storage: StorageInfo;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  updateSettings: (newSettings: Partial<AdvancedSettings>) => void;
  fetchStorageInfo: () => Promise<void>;
}

const DEFAULT_SETTINGS: AdvancedSettings = {
  httpRpc: true,
  wsRpc: false,
  corsOrigins: "https://*.cointmu.net",
  logLevel: "Info",
};

const DEFAULT_STORAGE: StorageInfo = {
  datadir: "",
  dbSize: 0,
};

/**
 * Persists the advanced settings to electron-store, swallowing write errors so
 * a storage failure never breaks the in-memory preference flow.
 * @param settings - The current advanced settings to persist.
 * @returns Nothing.
 */
function persistSettings(settings: AdvancedSettings): void {
  void setSetting(ADVANCED_SETTINGS_KEY, settings).catch((err) => {
    console.error("Failed to persist advanced settings", err);
  });
}

/**
 * Global advanced-settings store. Developer/RPC preferences are hydrated from
 * electron-store and mirrored back on every change, while the storage info
 * (datadir and chain DB size) is fetched on demand from the main process and
 * never persisted.
 */
export const useAdvancedStore = create<AdvancedStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  storage: DEFAULT_STORAGE,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const stored = await getSetting<Partial<AdvancedSettings> | null>(
        ADVANCED_SETTINGS_KEY,
      );
      set({
        settings: { ...DEFAULT_SETTINGS, ...(stored ?? {}) },
        hydrated: true,
      });
    } catch (err) {
      console.error("Failed to hydrate advanced store", err);
      set({ hydrated: true });
    }
  },
  updateSettings: (newSettings: Partial<AdvancedSettings>) => {
    set((state) => {
      const settings = { ...state.settings, ...newSettings };
      persistSettings(settings);
      return { settings };
    });
  },
  fetchStorageInfo: async () => {
    try {
      const [datadir, dbSize] = await Promise.all([
        window.api.getDatadir(),
        window.api.getChainDbSize(),
      ]);
      set({ storage: { datadir, dbSize } });
    } catch (err) {
      console.error("Failed to fetch storage info", err);
    }
  },
}));
