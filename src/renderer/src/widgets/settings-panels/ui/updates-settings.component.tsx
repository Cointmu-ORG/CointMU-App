import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { UpdateInstallMode } from "@bridge/setting-values";
import { useStoredSetting } from "@/features/settings";
import {
  SettingChoice,
  SettingRow,
  SettingSwitch,
  SettingsGroup,
} from "./setting-controls.component";

/**
 * Settings → General → Updates: the check at start, and when a downloaded
 * update is installed. Either way it installs only after geth has stopped.
 * @returns The section.
 */
export function UpdatesSettings(): JSX.Element {
  const { t } = useTranslation();
  const [isAutoCheck, setIsAutoCheck] = useStoredSetting(
    "updates.autoCheck",
    true,
  );
  const [installMode, setInstallMode] = useStoredSetting<UpdateInstallMode>(
    "updates.installMode",
    UpdateInstallMode.ON_QUIT,
  );
  const autoCheckTitle = t("settings:general.autoCheckTitle");
  const installTitle = t("settings:general.installModeTitle");

  return (
    <SettingsGroup title={t("settings:general.updates")}>
      <SettingRow
        title={autoCheckTitle}
        description={t("settings:general.autoCheckDesc")}
      >
        <SettingSwitch
          label={autoCheckTitle}
          checked={isAutoCheck}
          onChange={setIsAutoCheck}
        />
      </SettingRow>
      <SettingRow
        title={installTitle}
        description={t("settings:general.installModeDesc")}
      >
        <SettingChoice
          label={installTitle}
          value={installMode}
          options={[
            {
              value: UpdateInstallMode.ON_QUIT,
              label: t("settings:general.installOnQuit"),
            },
            {
              value: UpdateInstallMode.ASK,
              label: t("settings:general.installAsk"),
            },
          ]}
          onChange={setInstallMode}
        />
      </SettingRow>
    </SettingsGroup>
  );
}
