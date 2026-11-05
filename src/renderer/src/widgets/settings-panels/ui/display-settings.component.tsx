import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { ZOOM_PERCENT_OPTIONS, type ZoomPercent } from "@bridge/setting-values";
import { useStoredSetting } from "@/features/settings";
import {
  SettingChoice,
  SettingRow,
  SettingsGroup,
} from "./setting-controls.component";

const DEFAULT_ZOOM_PERCENT: ZoomPercent = 100;
const PERCENT = 100;

/**
 * Settings → Appearance → Display: the window zoom.
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
    </SettingsGroup>
  );
}
