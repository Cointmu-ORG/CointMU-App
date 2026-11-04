import { LayoutDensity, LogLevel } from "@bridge/setting-values";

// Label keys for stored setting codes. Literal keys (not built from the code)
// so i18n:audit can check that every one exists in every locale.

export const DENSITY_LABEL_KEYS: Readonly<Record<LayoutDensity, string>> = {
  [LayoutDensity.COMPACT]: "settings:options.density.compact",
  [LayoutDensity.COMFORTABLE]: "settings:options.density.comfortable",
  [LayoutDensity.SPACIOUS]: "settings:options.density.spacious",
};

// Only the levels Settings offers (features/settings LOG_LEVELS).
export const LOG_LEVEL_LABEL_KEYS = {
  [LogLevel.INFO]: "settings:options.logLevel.info",
  [LogLevel.DEBUG]: "settings:options.logLevel.debug",
} as const;
