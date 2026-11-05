import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { useStoredSetting } from "@/features/settings";
import {
  SettingChoice,
  SettingRow,
  SettingSwitch,
  SettingsGroup,
} from "./setting-controls.component";

const IDLE_MINUTE_OPTIONS = [1, 2, 5, 10, 15] as const;
const DEFAULT_IDLE_MINUTES = 2;

/**
 * Settings → Mining → When to mine: conditions the mining policy in main
 * applies to mining the user started. They pause and resume it; they never
 * start it on their own.
 * @returns The section.
 */
export function MiningConditionsSettings(): JSX.Element {
  const { t } = useTranslation();
  const [isIdleOnly, setIsIdleOnly] = useStoredSetting(
    "mining.idleOnly",
    false,
  );
  const [idleMinutes, setIdleMinutes] = useStoredSetting<number>(
    "mining.idleThresholdMinutes",
    DEFAULT_IDLE_MINUTES,
  );
  const idleTitle = t("settings:miningSettings.idleOnlyTitle");
  const thresholdTitle = t("settings:miningSettings.idleAfterTitle");

  return (
    <SettingsGroup title={t("settings:miningSettings.whenToMine")}>
      <SettingRow
        title={idleTitle}
        description={t("settings:miningSettings.idleOnlyDesc")}
      >
        <SettingSwitch
          label={idleTitle}
          checked={isIdleOnly}
          onChange={setIsIdleOnly}
        />
      </SettingRow>
      {isIdleOnly && (
        <SettingRow title={thresholdTitle}>
          <SettingChoice
            label={thresholdTitle}
            value={idleMinutes}
            options={IDLE_MINUTE_OPTIONS.map((minutes) => ({
              value: minutes,
              label: t("settings:miningSettings.minutes", { count: minutes }),
            }))}
            onChange={setIdleMinutes}
          />
        </SettingRow>
      )}
    </SettingsGroup>
  );
}
