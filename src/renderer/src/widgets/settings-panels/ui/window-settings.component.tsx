import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { CloseAction } from "@bridge/setting-values";
import { getShellCapabilities } from "@/shared/api";
import {
  SettingChoice,
  SettingRow,
  SettingsGroup,
} from "./setting-controls.component";

interface WindowSettingsProps {
  closeAction: CloseAction;
  onUpdate: (key: string, value: unknown) => void;
}

/**
 * Settings → General → Window: what the close button does. Hidden where no
 * tray can be shown (macOS keeps the dock, Linux without a tray host); there
 * close always quits.
 * @param props - The stored close action and the update callback.
 * @returns The section, or nothing without tray support.
 */
export function WindowSettings({
  closeAction,
  onUpdate,
}: WindowSettingsProps): JSX.Element | null {
  const { t } = useTranslation();
  const [isTraySupported, setIsTraySupported] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void getShellCapabilities().then((caps) => {
      if (isMounted) setIsTraySupported(caps.isTraySupported);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!isTraySupported) return null;

  const title = t("settings:general.closeActionTitle");
  return (
    <SettingsGroup title={t("settings:general.window")}>
      <SettingRow
        title={title}
        description={
          closeAction === CloseAction.TRAY
            ? t("settings:general.closeTrayHint")
            : t("settings:general.closeActionDesc")
        }
      >
        <SettingChoice
          label={title}
          value={closeAction}
          options={[
            { value: CloseAction.QUIT, label: t("settings:general.closeQuit") },
            { value: CloseAction.TRAY, label: t("settings:general.closeTray") },
          ]}
          onChange={(value) => onUpdate("closeAction", value)}
        />
      </SettingRow>
    </SettingsGroup>
  );
}
