import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  LayoutDensity,
  MotionPreference,
  ThemeMode,
} from "@bridge/setting-values";
import {
  APPEARANCE_STORAGE_VERSION,
  migrateAppearance,
} from "./appearance-migration";

export interface AppearanceState {
  theme: ThemeMode;
  accentColor: string;
  density: LayoutDensity;
  // No control yet (#104): the sidebar icons have no colors to switch.
  showSidebarColors: boolean;
  motion: MotionPreference;
  setTheme: (theme: ThemeMode) => void;
  setAccentColor: (color: string) => void;
  setDensity: (density: LayoutDensity) => void;
  setMotion: (motion: MotionPreference) => void;
  resetToDefaults: () => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: ThemeMode.AUTO,
      accentColor: "#3b82f6",
      density: LayoutDensity.COMFORTABLE,
      showSidebarColors: true,
      motion: MotionPreference.AUTO,
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setDensity: (density) => set({ density }),
      setMotion: (motion) => set({ motion }),
      resetToDefaults: () =>
        set({
          theme: ThemeMode.LIGHT,
          accentColor: "#3b82f6",
          density: LayoutDensity.COMFORTABLE,
          showSidebarColors: true,
          motion: MotionPreference.AUTO,
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
  root.setAttribute(
    "data-animations",
    String(isMotionOn(state.motion, reducedMotionQuery.matches)),
  );
};

const reducedMotionQuery = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
);

/**
 * @param motion - The user's choice.
 * @param prefersReduced - The OS asks for reduced motion.
 * @returns Whether transitions and animations run.
 */
export function isMotionOn(
  motion: MotionPreference,
  prefersReduced: boolean,
): boolean {
  if (motion === MotionPreference.AUTO) return !prefersReduced;
  return motion === MotionPreference.ON;
}

// Global initializer to apply appearance effects
useAppearanceStore.subscribe(applyAppearanceEffects);
applyAppearanceEffects(useAppearanceStore.getState());
// Automatic follows the OS setting while the app runs.
reducedMotionQuery.addEventListener("change", () =>
  applyAppearanceEffects(useAppearanceStore.getState()),
);
