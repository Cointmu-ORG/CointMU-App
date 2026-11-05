import {
  DisplayCurrency,
  LayoutDensity,
  LogLevel,
  MiningIntensity,
  SyncMode,
  ThemeMode,
  toSettingCode,
} from "../../bridge/setting-values";
import { SETTING_RULES } from "./settingRules";

type StoreData = Record<string, unknown>;

interface CodedSetting {
  readonly section: string;
  readonly key: string;
  readonly codes: readonly string[];
  readonly fallback: string;
  readonly legacyLabels?: Readonly<Record<string, string>>;
}

/** Settings whose stored value was the English label up to 1.6.18. */
const CODED_SETTINGS: readonly CodedSetting[] = [
  {
    section: "general",
    key: "currency",
    codes: Object.values(DisplayCurrency),
    fallback: DisplayCurrency.CMU,
    legacyLabels: {
      "CMU (native)": DisplayCurrency.CMU,
      "USD ($)": DisplayCurrency.USD,
      "EUR (€)": DisplayCurrency.EUR,
      // 1.6.18 shipped the euro sign stripped from the option label.
      "EUR ()": DisplayCurrency.EUR,
    },
  },
  {
    section: "network",
    key: "syncMode",
    codes: Object.values(SyncMode),
    fallback: SyncMode.SNAP,
    legacyLabels: { "Snap (recommended)": SyncMode.SNAP },
  },
  {
    section: "mining",
    key: "intensity",
    codes: Object.values(MiningIntensity),
    fallback: MiningIntensity.BALANCED,
  },
  {
    section: "advanced",
    key: "logLevel",
    codes: Object.values(LogLevel),
    fallback: LogLevel.INFO,
  },
  {
    section: "appearance",
    key: "theme",
    codes: Object.values(ThemeMode),
    fallback: ThemeMode.LIGHT,
  },
  {
    section: "appearance",
    key: "density",
    codes: Object.values(LayoutDensity),
    fallback: LayoutDensity.COMFORTABLE,
  },
];

// Up to 1.7.2 the app could switch networks: the chosen label, the custom
// networks and the chain id override that moved geth to another chain. It now
// runs CointMU Mainnet only, so these keys are dropped, along with the RPC
// endpoint field that nothing ever read.
const REMOVED_NETWORK_KEYS = [
  "network",
  "customNetworks",
  "chainId",
  "rpcEndpoint",
] as const;

/**
 * @param value - A store value.
 * @returns The value as a plain object section, or null.
 */
function asSection(value: unknown): StoreData | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as StoreData)
    : null;
}

/**
 * Converts the stored settings from earlier versions: labels (1.6.18 and
 * earlier) become codes, the network choice (1.7.2 and earlier) is removed,
 * and the unused `general.language` (the UI language lives in the renderer's
 * localStorage) is removed. Missing
 * sections and keys are left missing; the store defaults cover them.
 * Idempotent: running it on its own output changes nothing.
 * @param data - The whole store content.
 * @returns A migrated copy, or null when nothing needed to change.
 */
export function migrateSettingValues<T extends StoreData>(data: T): T | null {
  const migrated: StoreData = structuredClone(data);
  let hasChanged = false;

  for (const setting of CODED_SETTINGS) {
    const section = asSection(migrated[setting.section]);
    if (!section || !(setting.key in section)) continue;
    const code = toSettingCode(
      section[setting.key],
      setting.codes,
      setting.fallback,
      setting.legacyLabels,
    );
    if (section[setting.key] !== code) {
      section[setting.key] = code;
      hasChanged = true;
    }
  }

  const network = asSection(migrated.network);
  for (const key of REMOVED_NETWORK_KEYS) {
    if (network && key in network) {
      delete network[key];
      hasChanged = true;
    }
  }

  const general = asSection(migrated.general);
  if (general && "language" in general) {
    delete general.language;
    hasChanged = true;
  }

  return hasChanged ? (migrated as T) : null;
}

// Up to the settings batch, auto-lock was a switch with a fixed 5 minutes.
const LEGACY_AUTO_LOCK_MINUTES = 5;

/**
 * Converts the old auto-lock switch to minutes, keeping what users had: on
 * stays 5 minutes (new installs get 15), off becomes Never (0). Runs before
 * applySettingRules, which would otherwise fill in the new default.
 * Idempotent.
 * @param data - The whole store content.
 * @returns A converted copy, or null when nothing needed to change.
 */
export function migrateAutoLock<T extends StoreData>(data: T): T | null {
  const security = asSection(data.security);
  if (!security || !("autoLock" in security)) return null;
  const migrated: StoreData = structuredClone(data);
  const section = migrated.security as StoreData;
  if (!("autoLockMinutes" in section)) {
    section.autoLockMinutes =
      section.autoLock === false ? 0 : LEGACY_AUTO_LOCK_MINUTES;
  }
  delete section.autoLock;
  return migrated as T;
}

/**
 * Sets every ruled setting (SETTING_RULES) that is missing or holds a value
 * its rule rejects, such as a hand-edited config.json, to its default.
 * Idempotent; runs after migrateSettingValues.
 * @param data - The whole store content.
 * @returns A filled copy, or null when nothing needed to change.
 */
export function applySettingRules<T extends StoreData>(data: T): T | null {
  const filled: StoreData = structuredClone(data);
  let hasChanged = false;
  for (const [dottedKey, rule] of Object.entries(SETTING_RULES)) {
    const parts = dottedKey.split(".");
    const leafKey = parts.pop() ?? dottedKey;
    let node = filled;
    for (const part of parts) {
      if (!asSection(node[part])) node[part] = {};
      node = node[part] as StoreData;
    }
    if (leafKey in node && rule.isValid(node[leafKey])) continue;
    node[leafKey] = structuredClone(rule.fallback);
    hasChanged = true;
  }
  return hasChanged ? (filled as T) : null;
}
