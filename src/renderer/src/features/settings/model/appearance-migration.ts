import {
  LayoutDensity,
  ThemeMode,
  toSettingCode,
} from "@bridge/setting-values";

// Version 1 stores codes ("dark", "compact"); version 0 (up to 1.6.18)
// stored the English labels ("Dark", "Compact").
export const APPEARANCE_STORAGE_VERSION = 1;

export interface StoredAppearance {
  readonly theme: ThemeMode;
  readonly density: LayoutDensity;
  readonly [field: string]: unknown;
}

/**
 * Converts appearance saved by an older version to codes. Unknown values fall
 * back to the defaults; other fields pass through.
 * @param persisted - The stored state of any earlier version.
 * @returns The state in the current format.
 */
export function migrateAppearance(persisted: unknown): StoredAppearance {
  const state = (
    typeof persisted === "object" && persisted !== null ? persisted : {}
  ) as Record<string, unknown>;
  return {
    ...state,
    theme: toSettingCode(state.theme, Object.values(ThemeMode), ThemeMode.AUTO),
    density: toSettingCode(
      state.density,
      Object.values(LayoutDensity),
      LayoutDensity.COMFORTABLE,
    ),
  };
}
