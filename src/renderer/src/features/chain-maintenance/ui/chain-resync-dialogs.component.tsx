import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { DIALOG_BUTTON_CLASS, SettingsDialog } from "@/shared/ui";
import { formatBytes } from "@/shared/lib";
import type { ChainResyncState } from "../lib/chain-resync.hook";
import { KeptAndRemovedList } from "./kept-and-removed-list.component";

const KEPT_KEYS = ["wallets", "settings", "tokens"] as const;

/**
 * The confirm, running and result dialogs of "Resync from scratch".
 * @param props - The resync state from useChainResync.
 * @returns The dialog for the current step, or nothing.
 */
export function ChainResyncDialogs({
  resync,
}: {
  resync: ChainResyncState;
}): JSX.Element | null {
  const { t } = useTranslation(["settings"]);
  const { step } = resync;

  if (step.kind === "confirm") {
    const size = resync.info ? formatBytes(resync.info.chainSizeBytes) : "…";
    return (
      <SettingsDialog
        title={t("settings:maintenance.resyncConfirmTitle")}
        onClose={resync.close}
        actions={
          <>
            <button
              className={DIALOG_BUTTON_CLASS.secondary}
              onClick={resync.close}
            >
              {t("settings:general.cancel")}
            </button>
            <button
              className={DIALOG_BUTTON_CLASS.danger}
              onClick={() => void resync.confirm()}
            >
              {t("settings:maintenance.resyncConfirm")}
            </button>
          </>
        }
      >
        <p>{t("settings:maintenance.resyncConfirmBody", { size })}</p>
        <KeptAndRemovedList
          removedTitle={t("settings:maintenance.removedTitle")}
          removed={[t("settings:maintenance.item.chainData", { size })]}
          keptTitle={t("settings:maintenance.keptTitle")}
          kept={KEPT_KEYS.map((key) => t(`settings:maintenance.item.${key}`))}
        />
        <p>{t("settings:maintenance.resyncBackupNote")}</p>
      </SettingsDialog>
    );
  }

  if (step.kind === "running") {
    return (
      <SettingsDialog
        title={t("settings:maintenance.resyncTitle")}
        actions={null}
      >
        <p role="status" className="flex items-center gap-3">
          <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-accent animate-spin motion-reduce:animate-none" />
          {t("settings:maintenance.resyncRunning")}
        </p>
      </SettingsDialog>
    );
  }

  if (step.kind === "done" || step.kind === "failed") {
    return (
      <SettingsDialog
        title={t("settings:maintenance.resyncTitle")}
        onClose={resync.close}
        actions={
          <button
            className={DIALOG_BUTTON_CLASS.primary}
            onClick={resync.close}
          >
            {t("settings:maintenance.close")}
          </button>
        }
      >
        <p role="status">
          {step.kind === "done"
            ? t("settings:maintenance.resyncDone")
            : t(`settings:maintenance.resyncError.${step.error}`)}
        </p>
      </SettingsDialog>
    );
  }

  return null;
}
