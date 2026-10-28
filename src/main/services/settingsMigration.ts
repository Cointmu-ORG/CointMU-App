import {
  DisplayCurrency,
  LayoutDensity,
  LogLevel,
  MiningIntensity,
  SyncMode,
  ThemeMode,
  toSettingCode,
} from "../../bridge/setting-values";

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

// 1.6.18 shipped U+FFFD instead of "·" in the network option labels; the
// label is the stored value and is also sent to the browser extension.
const NETWORK_LABEL_FIXES: Readonly<Record<string, string>> = {
  "CointMU Mainnet � chain ID 1912": "CointMU Mainnet · chain ID 1912",
  "CointMU Testnet � chain ID 7013": "CointMU Testnet · chain ID 7013",
};

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
 * Converts the stored settings from 1.6.18 and earlier: labels become codes,
 * the broken network label is repaired, and the unused `general.language`
 * (the UI language lives in the renderer's localStorage) is removed. Missing
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
  const networkLabel = network?.network;
  if (
    network &&
    typeof networkLabel === "string" &&
    Object.hasOwn(NETWORK_LABEL_FIXES, networkLabel)
  ) {
    network.network = NETWORK_LABEL_FIXES[networkLabel];
    hasChanged = true;
  }

  const general = asSection(migrated.general);
  if (general && "language" in general) {
    delete general.language;
    hasChanged = true;
  }

  return hasChanged ? (migrated as T) : null;
}
