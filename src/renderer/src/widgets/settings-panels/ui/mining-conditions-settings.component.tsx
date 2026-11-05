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
const TIME_INPUT_CLASS =
  "px-2 py-1.5 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono text-slate-800 dark:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * The schedule window: start and end, local time; the end may be after
 * midnight (22:00 to 07:00).
 * @returns The schedule rows.
 */
function ScheduleRows(): JSX.Element {
  const { t } = useTranslation();
  const [isScheduled, setIsScheduled] = useStoredSetting(
    "mining.schedule.enabled",
    false,
  );
  const [start, setStart] = useStoredSetting("mining.schedule.start", "22:00");
  const [end, setEnd] = useStoredSetting("mining.schedule.end", "07:00");
  const title = t("settings:miningSettings.scheduleTitle");

  return (
    <>
      <SettingRow
        title={title}
        description={t("settings:miningSettings.scheduleDesc")}
      >
        <SettingSwitch
          label={title}
          checked={isScheduled}
          onChange={setIsScheduled}
        />
      </SettingRow>
      {isScheduled && (
        <SettingRow title={t("settings:miningSettings.scheduleWindow")}>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-gray-400">
            <input
              type="time"
              aria-label={t("settings:miningSettings.scheduleStart")}
              value={start}
              onChange={(event) =>
                event.target.value && setStart(event.target.value)
              }
              className={TIME_INPUT_CLASS}
            />
            <span aria-hidden="true">–</span>
            <input
              type="time"
              aria-label={t("settings:miningSettings.scheduleEnd")}
              value={end}
              onChange={(event) =>
                event.target.value && setEnd(event.target.value)
              }
              className={TIME_INPUT_CLASS}
            />
          </div>
        </SettingRow>
      )}
    </>
  );
}
const DEFAULT_IDLE_MINUTES = 2;

/**
 * Settings → Mining → Resource use: geth's CPU priority, applied to the
 * running node without a restart.
 * @returns The section.
 */
function ResourceUseSettings(): JSX.Element {
  const { t } = useTranslation();
  const [isLowPriority, setIsLowPriority] = useStoredSetting(
    "mining.lowPriority",
    false,
  );
  const title = t("settings:miningSettings.lowPriorityTitle");
  return (
    <SettingsGroup title={t("settings:miningSettings.resourceUse")}>
      <SettingRow
        title={title}
        description={t("settings:miningSettings.lowPriorityDesc")}
      >
        <SettingSwitch
          label={title}
          checked={isLowPriority}
          onChange={setIsLowPriority}
        />
      </SettingRow>
    </SettingsGroup>
  );
}

/**
 * Settings → Mining → When to mine: conditions the mining policy in main
 * applies to mining the user started. They pause and resume it; they never
 * start it on their own. Followed by Resource use.
 * @returns The sections.
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
    <>
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
        <ScheduleRows />
      </SettingsGroup>
      <ResourceUseSettings />
    </>
  );
}
