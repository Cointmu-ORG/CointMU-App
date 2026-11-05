import {
  LayoutDensity,
  MotionPreference,
  ThemeMode,
  toSettingCode,
} from "@bridge/setting-values";

// Version 2 replaces the animatedTransitions switch with motion
// (auto/on/off); version 1 stores codes ("dark", "compact"); version 0 (up
// to 1.6.18) stored the English labels ("Dark", "Compact").
export const APPEARANCE_STORAGE_VERSION = 2;

export interface StoredAppearance {
  readonly theme: ThemeMode;
  readonly density: LayoutDensity;
  readonly motion: MotionPreference;
  readonly [field: string]: unknown;
}

/**
 * The old switch was on by default, so "on" becomes Automatic (which honours
 * the OS's reduced motion); only a switch the user turned off stays off.
 * @param state - Stored appearance of any version.
 * @returns The motion preference.
 */
function migrateMotion(state: Record<string, unknown>): MotionPreference {
  const codes: readonly unknown[] = Object.values(MotionPreference);
  if (codes.includes(state.motion)) return state.motion as MotionPreference;
  return state.animatedTransitions === false
    ? MotionPreference.OFF
    : MotionPreference.AUTO;
}

/**
 * Converts appearance saved by an older version. Unknown values fall back to
 * the defaults; other fields pass through. Idempotent.
 * @param persisted - The stored state of any earlier version.
 * @returns The state in the current format.
 */
export function migrateAppearance(persisted: unknown): StoredAppearance {
  const state = (
    typeof persisted === "object" && persisted !== null ? persisted : {}
  ) as Record<string, unknown>;
  const { animatedTransitions: _dropped, ...rest } = state;
  return {
    ...rest,
    theme: toSettingCode(state.theme, Object.values(ThemeMode), ThemeMode.AUTO),
    density: toSettingCode(
      state.density,
      Object.values(LayoutDensity),
      LayoutDensity.COMFORTABLE,
    ),
    motion: migrateMotion(state),
  };
}
