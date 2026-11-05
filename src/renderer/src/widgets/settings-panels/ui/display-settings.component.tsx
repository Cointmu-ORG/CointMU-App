import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { ZOOM_PERCENT_OPTIONS, type ZoomPercent } from "@bridge/setting-values";
import { useStoredSetting } from "@/features/settings";
import {
  BALANCE_DECIMAL_OPTIONS,
  TimeFormat,
  useDisplayPrefs,
} from "@/shared/model";
import {
  SettingChoice,
  SettingRow,
  SettingsGroup,
} from "./setting-controls.component";

const DEFAULT_ZOOM_PERCENT: ZoomPercent = 100;
const PERCENT = 100;

/**
 * Settings → Appearance → Display: the window zoom, the clock style and the
 * decimals of CMU balances. The last two only change how values are shown,
 * through the shared formatters (formatDateTime, formatBalance).
 * @returns The section.
 */
export function DisplaySettings(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [zoom, setZoom] = useStoredSetting<ZoomPercent>(
    "appearance.zoomPercent",
    DEFAULT_ZOOM_PERCENT,
  );
  const percent = new Intl.NumberFormat(i18n.language, { style: "percent" });
  const zoomTitle = t("settings:appearance.zoomTitle");
  const timeTitle = t("settings:appearance.timeFormatTitle");
  const decimalsTitle = t("settings:appearance.decimalsTitle");
  const prefs = useDisplayPrefs();

  return (
    <SettingsGroup title={t("settings:appearance.display")}>
      <SettingRow
        title={zoomTitle}
        description={t("settings:appearance.zoomDesc")}
      >
        <SettingChoice
          label={zoomTitle}
          value={zoom}
          options={ZOOM_PERCENT_OPTIONS.map((value) => ({
            value,
            label: percent.format(value / PERCENT),
          }))}
          onChange={setZoom}
        />
      </SettingRow>
      <SettingRow
        title={timeTitle}
        description={t("settings:appearance.timeFormatDesc")}
      >
        <SettingChoice
          label={timeTitle}
          value={prefs.timeFormat}
          options={[
            {
              value: TimeFormat.AUTO,
              label: t("settings:appearance.timeAuto"),
            },
            { value: TimeFormat.H12, label: t("settings:appearance.time12") },
            { value: TimeFormat.H24, label: t("settings:appearance.time24") },
          ]}
          onChange={prefs.setTimeFormat}
        />
      </SettingRow>
      <SettingRow
        title={decimalsTitle}
        description={t("settings:appearance.decimalsDesc")}
      >
        <SettingChoice
          label={decimalsTitle}
          value={prefs.balanceDecimals}
          options={BALANCE_DECIMAL_OPTIONS.map((value) => ({
            value,
            label:
              value === "full"
                ? t("settings:appearance.decimalsFull")
                : String(value),
          }))}
          onChange={prefs.setBalanceDecimals}
        />
      </SettingRow>
    </SettingsGroup>
  );
}
