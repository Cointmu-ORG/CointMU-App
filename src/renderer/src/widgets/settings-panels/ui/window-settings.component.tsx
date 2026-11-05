import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { CloseAction } from "@bridge/setting-values";
import { getShellCapabilities } from "@/shared/api";
import {
  SettingChoice,
  SettingRow,
  SettingSwitch,
  SettingsGroup,
} from "./setting-controls.component";

interface WindowSettingsProps {
  closeAction: CloseAction;
  confirmQuitWhileBusy: boolean;
  onUpdate: (key: string, value: unknown) => void;
}

/**
 * Settings → General → Window: what the close button does, and whether to
 * ask before quitting while the node mines or syncs. The close choice is
 * hidden where no tray can be shown (macOS keeps the dock, Linux without a
 * tray host); there close always quits.
 * @param props - The stored values and the update callback.
 * @returns The section.
 */
export function WindowSettings({
  closeAction,
  confirmQuitWhileBusy,
  onUpdate,
}: WindowSettingsProps): JSX.Element {
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

  const title = t("settings:general.closeActionTitle");
  const confirmTitle = t("settings:general.confirmQuitTitle");
  return (
    <SettingsGroup title={t("settings:general.window")}>
      {isTraySupported && (
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
              {
                value: CloseAction.QUIT,
                label: t("settings:general.closeQuit"),
              },
              {
                value: CloseAction.TRAY,
                label: t("settings:general.closeTray"),
              },
            ]}
            onChange={(value) => onUpdate("closeAction", value)}
          />
        </SettingRow>
      )}
      <SettingRow
        title={confirmTitle}
        description={t("settings:general.confirmQuitDesc")}
      >
        <SettingSwitch
          label={confirmTitle}
          checked={confirmQuitWhileBusy}
          onChange={(checked) => onUpdate("confirmQuitWhileBusy", checked)}
        />
      </SettingRow>
    </SettingsGroup>
  );
}
