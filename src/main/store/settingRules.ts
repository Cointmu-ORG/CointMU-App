import { CloseAction, UpdateInstallMode } from "../../bridge/setting-values";

/** Where the chain data lives; "" is the default folder. Only the move writes it. */
export const CHAIN_DATA_ROOT_KEY = "chainDataRoot";

/** The default and the accepted values of one stored setting. */
interface SettingRule {
  readonly fallback: unknown;
  readonly isValid: (value: unknown) => boolean;
}

const isBoolean = (value: unknown): boolean => typeof value === "boolean";

const isOneOf =
  (codes: readonly unknown[]) =>
  (value: unknown): boolean =>
    codes.includes(value);

/**
 * Settings added in the settings batch, by dotted key. They are not in the
 * electron-store defaults: those only fill missing top-level sections, so a
 * key added to an existing section would stay missing for current users.
 * settingsMigration fills each one in instead. Older settings have no rule
 * and are stored as sent.
 */
export const SETTING_RULES: Readonly<Record<string, SettingRule>> = {
  "general.closeAction": {
    fallback: CloseAction.QUIT,
    isValid: isOneOf(Object.values(CloseAction)),
  },
  "general.confirmQuitWhileBusy": { fallback: true, isValid: isBoolean },
  "updates.autoCheck": { fallback: true, isValid: isBoolean },
  "updates.installMode": {
    fallback: UpdateInstallMode.ON_QUIT,
    isValid: isOneOf(Object.values(UpdateInstallMode)),
  },
  [CHAIN_DATA_ROOT_KEY]: {
    fallback: "",
    isValid: (value) => typeof value === "string",
  },
};

/**
 * @param value - Any value.
 * @param path - Keys below `value`, e.g. ["schedule", "start"].
 * @returns Whether the path exists, and the value found there.
 */
function readPath(
  value: unknown,
  path: readonly string[],
): { found: boolean; leaf: unknown } {
  let node = value;
  for (const part of path) {
    if (typeof node !== "object" || node === null || !(part in node)) {
      return { found: false, leaf: undefined };
    }
    node = (node as Record<string, unknown>)[part];
  }
  return { found: true, leaf: node };
}

/**
 * Checks a `settings:set` write against the rules. A write of a whole section
 * (`security` with an object) is checked for every ruled key it contains; a
 * key it leaves out is not touched by the write and is not checked.
 * @param key - The dotted key being written.
 * @param value - The value being written.
 * @returns The first ruled dotted key the write would make invalid, or null.
 */
export function findInvalidSetting(key: string, value: unknown): string | null {
  for (const [ruledKey, rule] of Object.entries(SETTING_RULES)) {
    if (ruledKey !== key && !ruledKey.startsWith(`${key}.`)) continue;
    const below =
      ruledKey === key ? [] : ruledKey.slice(key.length + 1).split(".");
    const { found, leaf } = readPath(value, below);
    if (found && !rule.isValid(leaf)) return ruledKey;
  }
  return null;
}
