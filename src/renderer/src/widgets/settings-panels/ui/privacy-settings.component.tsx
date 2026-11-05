import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { useDisplayPrefs } from "@/shared/model";
import {
  SettingRow,
  SettingSwitch,
  SettingsGroup,
} from "./setting-controls.component";

/**
 * Settings → Appearance → Privacy: masks balances and amounts across the
 * app. The eye button in the title bar toggles the same setting.
 * @returns The section.
 */
export function PrivacySettings(): JSX.Element {
  const { t } = useTranslation();
  const isPrivacyMode = useDisplayPrefs((s) => s.isPrivacyMode);
  const setPrivacyMode = useDisplayPrefs((s) => s.setPrivacyMode);
  const title = t("settings:appearance.privacyModeTitle");

  return (
    <SettingsGroup title={t("settings:appearance.privacy")}>
      <SettingRow
        title={title}
        description={t("settings:appearance.privacyModeDesc")}
      >
        <SettingSwitch
          label={title}
          checked={isPrivacyMode}
          onChange={setPrivacyMode}
        />
      </SettingRow>
    </SettingsGroup>
  );
}
