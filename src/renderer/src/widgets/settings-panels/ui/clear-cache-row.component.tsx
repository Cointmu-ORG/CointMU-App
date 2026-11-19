import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import {
  KeptAndRemovedList,
  clearAllCaches,
  useConfirmedAction,
} from "@/features/chain-maintenance";
import { DIALOG_BUTTON_CLASS, SettingsDialog } from "@/shared/ui";
import { SettingButton, SettingRow } from "./setting-controls.component";

const REMOVED_KEYS = ["explorerIndex", "tokenScan", "nftMedia", "activity"];
const KEPT_KEYS = ["wallets", "settings", "logos", "chain"];

/**
 * Settings → Advanced → Data maintenance → Clear cache: drops everything the
 * app rebuilds from the node, after a confirmation listing what goes and
 * what stays.
 * @returns The row and its confirmation.
 */
export function ClearCacheRow(): JSX.Element {
  const { t } = useTranslation();
  const action = useConfirmedAction(clearAllCaches);
  const isSettled = action.status === "done" || action.status === "failed";

  return (
    <>
      <SettingRow
        title={t("settings:maintenance.cacheTitle")}
        description={
          <>
            {t("settings:maintenance.cacheDesc")}
            {isSettled && (
              <span
                role="status"
                className={`block mt-1 ${action.status === "done" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
              >
                {action.status === "done"
                  ? t("settings:maintenance.cacheDone")
                  : t("settings:maintenance.cacheFailed")}
              </span>
            )}
          </>
        }
      >
        <SettingButton
          isDisabled={action.status === "busy"}
          onClick={action.ask}
        >
          {t("settings:maintenance.cacheButton")}
        </SettingButton>
      </SettingRow>
      {action.status === "confirm" && (
        <SettingsDialog
          title={t("settings:maintenance.cacheConfirmTitle")}
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
                {t("settings:maintenance.cacheConfirm")}
              </button>
            </>
          }
        >
          <KeptAndRemovedList
            removedTitle={t("settings:maintenance.removedTitle")}
            removed={REMOVED_KEYS.map((key) =>
              t(`settings:maintenance.item.${key}`),
            )}
            keptTitle={t("settings:maintenance.keptTitle")}
            kept={KEPT_KEYS.map((key) => t(`settings:maintenance.item.${key}`))}
          />
          <p>{t("settings:maintenance.cacheRebuildNote")}</p>
        </SettingsDialog>
      )}
    </>
  );
}
