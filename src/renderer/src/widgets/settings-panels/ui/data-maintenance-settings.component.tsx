import { useEffect, type JSX } from "react";
import { useTranslation } from "react-i18next";
import {
  ChainResyncDialogs,
  useChainResync,
} from "@/features/chain-maintenance";
import { formatBytes } from "@/shared/lib";
import {
  SettingButton,
  SettingRow,
  SettingsGroup,
} from "./setting-controls.component";

/**
 * Settings → Advanced → Data maintenance: resync the chain from genesis and
 * delete the backup the resync (or a recovery) left behind.
 * @returns The section.
 */
export function DataMaintenanceSettings(): JSX.Element {
  const { t } = useTranslation();
  const resync = useChainResync();
  const { refresh } = resync;
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const backupBytes = resync.info?.backupSizeBytes ?? 0;

  return (
    <SettingsGroup title={t("settings:maintenance.title")}>
      <SettingRow
        title={t("settings:maintenance.resyncTitle")}
        description={t("settings:maintenance.resyncDesc")}
      >
        <SettingButton tone="danger" onClick={resync.open}>
          {t("settings:maintenance.resyncButton")}
        </SettingButton>
      </SettingRow>
      {backupBytes > 0 && (
        <SettingRow
          title={t("settings:maintenance.backupTitle")}
          description={
            <>
              {t("settings:maintenance.backupDesc", {
                size: formatBytes(backupBytes),
              })}
              {resync.hasBackupDeleteFailed && (
                <span
                  role="status"
                  className="block mt-1 text-red-600 dark:text-red-400"
                >
                  {t("settings:maintenance.backupFailed")}
                </span>
              )}
            </>
          }
        >
          <SettingButton
            isDisabled={resync.isDeletingBackup}
            onClick={() => void resync.deleteBackup()}
          >
            {t("settings:maintenance.backupDelete", {
              size: formatBytes(backupBytes),
            })}
          </SettingButton>
        </SettingRow>
      )}
      <ChainResyncDialogs resync={resync} />
    </SettingsGroup>
  );
}
