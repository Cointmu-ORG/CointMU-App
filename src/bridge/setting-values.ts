/**
 * Stored values of settings that are shown as translated labels. The store
 * keeps these codes; the UI maps each one to a label key. Up to 1.6.18 the
 * English label itself was stored, which `toSettingCode` converts.
 */

export const MiningIntensity = {
  ECO: "eco",
  BALANCED: "balanced",
  TURBO: "turbo",
} as const;

export type MiningIntensity =
  (typeof MiningIntensity)[keyof typeof MiningIntensity];

export const SyncMode = {
  SNAP: "snap",
  FULL: "full",
  LIGHT: "light",
} as const;

export type SyncMode = (typeof SyncMode)[keyof typeof SyncMode];

export const DisplayCurrency = {
  CMU: "cmu",
  USD: "usd",
  EUR: "eur",
} as const;

export type DisplayCurrency =
  (typeof DisplayCurrency)[keyof typeof DisplayCurrency];

export const LogLevel = {
  INFO: "info",
  DEBUG: "debug",
  WARN: "warn",
  ERROR: "error",
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const ThemeMode = {
  LIGHT: "light",
  DARK: "dark",
  AUTO: "auto",
} as const;

export type ThemeMode = (typeof ThemeMode)[keyof typeof ThemeMode];

export const LayoutDensity = {
  COMPACT: "compact",
  COMFORTABLE: "comfortable",
  SPACIOUS: "spacious",
} as const;

export type LayoutDensity = (typeof LayoutDensity)[keyof typeof LayoutDensity];

/**
 * Converts a stored setting value to its code. A code passes through
 * unchanged, so converting twice is a no-op.
 * @param value - The stored value: a code, a legacy label, or anything else.
 * @param codes - The valid codes, e.g. `Object.values(SyncMode)`.
 * @param fallback - Used for a value that is neither a code nor a label.
 * @param legacyLabels - Old labels that are not just the capitalized code.
 * @returns A valid code.
 */
export function toSettingCode<T extends string>(
  value: unknown,
  codes: readonly T[],
  fallback: T,
  legacyLabels: Readonly<Record<string, T>> = {},
): T {
  if (typeof value !== "string") return fallback;
  if (Object.hasOwn(legacyLabels, value)) return legacyLabels[value];
  const lower = value.toLowerCase();
  return codes.find((code) => code === lower) ?? fallback;
}
