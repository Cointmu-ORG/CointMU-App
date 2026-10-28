import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LayoutDensity, ThemeMode } from "@bridge/setting-values";
import {
  APPEARANCE_STORAGE_VERSION,
  migrateAppearance,
} from "./appearance-migration";

export interface AppearanceState {
  theme: ThemeMode;
  accentColor: string;
  density: LayoutDensity;
  showSidebarColors: boolean;
  animatedTransitions: boolean;
  setTheme: (theme: ThemeMode) => void;
  setAccentColor: (color: string) => void;
  setDensity: (density: LayoutDensity) => void;
  setShowSidebarColors: (show: boolean) => void;
  setAnimatedTransitions: (animate: boolean) => void;
  resetToDefaults: () => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: ThemeMode.AUTO,
      accentColor: "#3b82f6",
      density: LayoutDensity.COMFORTABLE,
      showSidebarColors: true,
      animatedTransitions: true,
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setDensity: (density) => set({ density }),
      setShowSidebarColors: (showSidebarColors) => set({ showSidebarColors }),
      setAnimatedTransitions: (animatedTransitions) =>
        set({ animatedTransitions }),
      resetToDefaults: () =>
        set({
          theme: ThemeMode.LIGHT,
          accentColor: "#3b82f6",
          density: LayoutDensity.COMFORTABLE,
          showSidebarColors: true,
          animatedTransitions: true,
        }),
    }),
    {
      name: "cointmu-appearance-storage",
      version: APPEARANCE_STORAGE_VERSION,
      migrate: (persisted) => migrateAppearance(persisted),
    },
  ),
);

const applyAppearanceEffects = (state: AppearanceState) => {
  const root = document.documentElement;

  // Handle Theme
  const isDark =
    state.theme === ThemeMode.DARK ||
    (state.theme === ThemeMode.AUTO &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  // Handle Accent Color
  document.documentElement.style.setProperty(
    "--color-accent",
    state.accentColor,
  );

  // Handle Layout Attributes
  root.setAttribute("data-density", state.density);
  root.setAttribute("data-animations", state.animatedTransitions.toString());
};

// Global initializer to apply appearance effects
useAppearanceStore.subscribe(applyAppearanceEffects);
applyAppearanceEffects(useAppearanceStore.getState());
