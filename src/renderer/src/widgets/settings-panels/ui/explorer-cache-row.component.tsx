import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { SettingButton, SettingRow } from "./setting-controls.component";
import {
  DIALOG_BUTTON_CLASS,
  SettingsDialog,
} from "./settings-dialog.component";

type ResetStatus = "idle" | "confirm" | "done" | "failed";

/**
 * Settings → General → Troubleshooting → Explorer cache: wipes the local
 * block index (#114) after a confirmation; it refills from the node.
 * @returns The row and its confirmation.
 */
export function ExplorerCacheRow(): JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ResetStatus>("idle");

  const reset = async (): Promise<void> => {
    try {
      await window.api.explorer.rebuildIndex();
      setStatus("done");
    } catch (err) {
      console.error("Failed to reset the explorer cache", err);
      setStatus("failed");
    }
  };

  return (
    <>
      <SettingRow
        title={t("settings:general.explorerCacheTitle")}
        description={
          <>
            {t("settings:general.explorerCacheDesc")}
            {(status === "done" || status === "failed") && (
              <span
                role="status"
                className={`block mt-1 ${status === "done" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
              >
                {status === "done"
                  ? t("settings:general.explorerCacheDone")
                  : t("settings:general.explorerCacheFailed")}
              </span>
            )}
          </>
        }
      >
        <SettingButton onClick={() => setStatus("confirm")}>
          {t("settings:general.explorerCacheReset")}
        </SettingButton>
      </SettingRow>
      {status === "confirm" && (
        <SettingsDialog
          title={t("settings:general.explorerCacheConfirmTitle")}
          onClose={() => setStatus("idle")}
          actions={
            <>
              <button
                className={DIALOG_BUTTON_CLASS.secondary}
                onClick={() => setStatus("idle")}
              >
                {t("settings:general.cancel")}
              </button>
              <button
                className={DIALOG_BUTTON_CLASS.danger}
                onClick={() => void reset()}
              >
                {t("settings:general.explorerCacheConfirm")}
              </button>
            </>
          }
        >
          <p>{t("settings:general.explorerCacheConfirmBody")}</p>
        </SettingsDialog>
      )}
    </>
  );
}
