import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AppearanceState {
  theme: "Light" | "Dark" | "Auto";
  accentColor: string;
  density: "Compact" | "Comfortable" | "Spacious";
  showSidebarColors: boolean;
  animatedTransitions: boolean;
  setTheme: (theme: "Light" | "Dark" | "Auto") => void;
  setAccentColor: (color: string) => void;
  setDensity: (density: "Compact" | "Comfortable" | "Spacious") => void;
  setShowSidebarColors: (show: boolean) => void;
  setAnimatedTransitions: (animate: boolean) => void;
  resetToDefaults: () => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: "Auto",
      accentColor: "#3b82f6",
      density: "Comfortable",
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
          theme: "Light",
          accentColor: "#3b82f6",
          density: "Comfortable",
          showSidebarColors: true,
          animatedTransitions: true,
        }),
    }),
    {
      name: "cointmu-appearance-storage",
    },
  ),
);

const applyAppearanceEffects = (state: AppearanceState) => {
  const root = document.documentElement;

  // Handle Theme
  const isDark =
    state.theme === "Dark" ||
    (state.theme === "Auto" &&
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
  root.setAttribute("data-density", state.density.toLowerCase());
  root.setAttribute("data-animations", state.animatedTransitions.toString());
};

// Global initializer to apply appearance effects
useAppearanceStore.subscribe(applyAppearanceEffects);
applyAppearanceEffects(useAppearanceStore.getState());
