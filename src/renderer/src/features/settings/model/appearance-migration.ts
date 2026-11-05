import {
  LayoutDensity,
  MotionPreference,
  ThemeMode,
  toSettingCode,
} from "@bridge/setting-values";

// Version 3 replaces showSidebarColors with sidebarIconColors; version 2
// replaces the animatedTransitions switch with motion (auto/on/off); version
// 1 stores codes ("dark", "compact"); version 0 (up to 1.6.18) stored the
// English labels ("Dark", "Compact").
export const APPEARANCE_STORAGE_VERSION = 3;

export interface StoredAppearance {
  readonly theme: ThemeMode;
  readonly density: LayoutDensity;
  readonly motion: MotionPreference;
  readonly sidebarIconColors: boolean;
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
 *
 * showSidebarColors is dropped, not carried over: it was stored as true for
 * everyone while no control existed, so honouring it would color the
 * sidebar for every user on update. Colored icons start off.
 * @param persisted - The stored state of any earlier version.
 * @returns The state in the current format.
 */
export function migrateAppearance(persisted: unknown): StoredAppearance {
  const state = (
    typeof persisted === "object" && persisted !== null ? persisted : {}
  ) as Record<string, unknown>;
  const {
    animatedTransitions: _dropped,
    showSidebarColors: _neverShown,
    ...rest
  } = state;
  return {
    ...rest,
    theme: toSettingCode(state.theme, Object.values(ThemeMode), ThemeMode.AUTO),
    density: toSettingCode(
      state.density,
      Object.values(LayoutDensity),
      LayoutDensity.COMFORTABLE,
    ),
    motion: migrateMotion(state),
    sidebarIconColors: state.sidebarIconColors === true,
  };
}
