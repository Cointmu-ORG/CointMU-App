import { create } from "zustand";
import type { AssetLogos } from "@bridge/types";
import {
  getAssetLogos,
  resetAssetLogo,
  saveAssetLogo,
} from "../api/asset-logo.service";

interface AssetLogoState {
  logos: AssetLogos;
  isLoaded: boolean;
  /** Loads the logos once; later calls are no-ops. */
  ensureLoaded: () => void;
  save: (key: string, dataUrl: string) => Promise<void>;
  reset: (key: string) => Promise<void>;
}

/**
 * Custom asset logos from the main-process store, shared by every TokenIcon
 * so a change shows everywhere the asset appears at once.
 */
export const useAssetLogoStore = create<AssetLogoState>((set, get) => ({
  logos: {},
  isLoaded: false,
  ensureLoaded: () => {
    if (get().isLoaded) return;
    set({ isLoaded: true });
    const load = async (): Promise<void> => {
      try {
        set({ logos: await getAssetLogos() });
      } catch (err) {
        set({ isLoaded: false });
        console.error("Failed to load asset logos", err);
      }
    };
    void load();
  },
  save: async (key, dataUrl) => {
    await saveAssetLogo(key, dataUrl);
    set((state) => ({ logos: { ...state.logos, [key]: dataUrl } }));
  },
  reset: async (key) => {
    await resetAssetLogo(key);
    set((state) => {
      const { [key]: _removed, ...rest } = state.logos;
      return { logos: rest };
    });
  },
}));
