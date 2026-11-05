import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { useStoredSetting } from "@/features/settings";
import { SettingRow, SettingSwitch } from "./setting-controls.component";

/**
 * Settings → Mining → Start mining at launch. Main starts mining 30 s after
 * the node is ready (MiningAutoStart) and shows a countdown with Cancel.
 * Off by default; shown only while Enable Mining is on, which it needs.
 * @returns The row.
 */
export function MiningAutoStartSetting(): JSX.Element {
  const { t } = useTranslation();
  const [isOn, setIsOn] = useStoredSetting("mining.autoStartAtLaunch", false);
  const title = t("settings:miningSettings.autoStartTitle");

  return (
    <SettingRow
      title={title}
      description={t("settings:miningSettings.autoStartDesc")}
    >
      <SettingSwitch label={title} checked={isOn} onChange={setIsOn} />
    </SettingRow>
  );
}
