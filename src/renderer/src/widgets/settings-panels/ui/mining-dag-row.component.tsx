import { useCallback, useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import type { DagInfo } from "@bridge/types";
import {
  deleteDag,
  getDagInfo,
  useConfirmedAction,
} from "@/features/chain-maintenance";
import { formatBytes } from "@/shared/lib";
import { DIALOG_BUTTON_CLASS, SettingsDialog } from "@/shared/ui";
import { SettingButton, SettingRow } from "./setting-controls.component";

/**
 * Settings → Advanced → Data maintenance → Mining DAG: its size and a
 * delete, disabled while mining (geth regenerates it on the next start).
 * @returns The row and its confirmation.
 */
export function MiningDagRow(): JSX.Element {
  const { t } = useTranslation();
  const [info, setInfo] = useState<DagInfo | null>(null);

  const refresh = useCallback((): void => {
    getDagInfo()
      .then(setInfo)
      .catch((err: unknown) => {
        console.error("[maintenance] Failed to read the DAG size", err);
      });
  }, []);
  useEffect(refresh, [refresh]);
  const action = useConfirmedAction(deleteDag, refresh);

  const size = formatBytes(info?.sizeBytes ?? 0);
  const isDisabled =
    !info || info.isMining || info.sizeBytes === 0 || action.status === "busy";

  return (
    <>
      <SettingRow
        title={t("settings:maintenance.dagTitle")}
        description={
          <>
            {t("settings:maintenance.dagDesc", { size })}
            {info?.isMining && (
              <span className="block mt-1">
                {t("settings:maintenance.dagMining")}
              </span>
            )}
            {action.status === "failed" && (
              <span
                role="status"
                className="block mt-1 text-red-600 dark:text-red-400"
              >
                {t("settings:maintenance.dagFailed")}
              </span>
            )}
          </>
        }
      >
        <SettingButton isDisabled={isDisabled} onClick={action.ask}>
          {t("settings:maintenance.dagButton")}
        </SettingButton>
      </SettingRow>
      {action.status === "confirm" && (
        <SettingsDialog
          title={t("settings:maintenance.dagConfirmTitle")}
          onClose={action.cancel}
          actions={
            <>
              <button
                className={DIALOG_BUTTON_CLASS.secondary}
                onClick={action.cancel}
              >
                {t("settings:general.cancel")}
              </button>
              <button
                className={DIALOG_BUTTON_CLASS.danger}
                onClick={() => void action.run()}
              >
                {t("settings:maintenance.dagConfirm")}
              </button>
            </>
          }
        >
          <p>{t("settings:maintenance.dagConfirmBody", { size })}</p>
        </SettingsDialog>
      )}
    </>
  );
}
