import {
  DisplayCurrency,
  LayoutDensity,
  LogLevel,
  MiningIntensity,
  SyncMode,
} from "@bridge/setting-values";

// Label keys for stored setting codes. Literal keys (not built from the code)
// so i18n:audit can check that every one exists in every locale.

export const INTENSITY_LABEL_KEYS: Readonly<Record<MiningIntensity, string>> = {
  [MiningIntensity.ECO]: "settings:options.intensity.eco",
  [MiningIntensity.BALANCED]: "settings:options.intensity.balanced",
  [MiningIntensity.TURBO]: "settings:options.intensity.turbo",
};

export const DENSITY_LABEL_KEYS: Readonly<Record<LayoutDensity, string>> = {
  [LayoutDensity.COMPACT]: "settings:options.density.compact",
  [LayoutDensity.COMFORTABLE]: "settings:options.density.comfortable",
  [LayoutDensity.SPACIOUS]: "settings:options.density.spacious",
};

export const SYNC_MODE_LABEL_KEYS: Readonly<Record<SyncMode, string>> = {
  [SyncMode.SNAP]: "settings:options.syncMode.snap",
  [SyncMode.FULL]: "settings:options.syncMode.full",
  [SyncMode.LIGHT]: "settings:options.syncMode.light",
};

export const CURRENCY_LABEL_KEYS: Readonly<Record<DisplayCurrency, string>> = {
  [DisplayCurrency.CMU]: "settings:options.currency.cmu",
  [DisplayCurrency.USD]: "settings:options.currency.usd",
  [DisplayCurrency.EUR]: "settings:options.currency.eur",
};

export const LOG_LEVEL_LABEL_KEYS: Readonly<Record<LogLevel, string>> = {
  [LogLevel.INFO]: "settings:options.logLevel.info",
  [LogLevel.DEBUG]: "settings:options.logLevel.debug",
  [LogLevel.WARN]: "settings:options.logLevel.warn",
  [LogLevel.ERROR]: "settings:options.logLevel.error",
};
