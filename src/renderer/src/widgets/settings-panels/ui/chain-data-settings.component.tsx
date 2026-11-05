import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { useChainDataMove, type ChainDataMoveState } from "@/features/settings";
import { formatBytes } from "@/shared/lib";
import {
  SettingButton,
  SettingRow,
  SettingsGroup,
} from "./setting-controls.component";
import {
  DIALOG_BUTTON_CLASS,
  SettingsDialog,
} from "./settings-dialog.component";

/**
 * The confirm, progress and "delete the old copy?" dialogs of a move.
 * @param props - The move state.
 * @returns The dialog for the current step, or nothing.
 */
function ChainDataMoveDialogs({
  move,
}: {
  move: ChainDataMoveState;
}): JSX.Element | null {
  const { t } = useTranslation();
  const { step } = move;

  if (step.kind === "confirm") {
    return (
      <SettingsDialog
        title={t("settings:general.chainDataConfirmTitle")}
        onClose={move.close}
        actions={
          <>
            <button
              className={DIALOG_BUTTON_CLASS.secondary}
              onClick={move.close}
            >
              {t("settings:general.cancel")}
            </button>
            <button
              className={DIALOG_BUTTON_CLASS.primary}
              onClick={() => void move.startMove()}
            >
              {t("settings:general.chainDataConfirmMove")}
            </button>
          </>
        }
      >
        <p className="font-mono text-xs break-all">{step.target}</p>
        <p>
          {t("settings:general.chainDataConfirmBody", {
            size: formatBytes(step.requiredBytes),
          })}
        </p>
      </SettingsDialog>
    );
  }

  if (step.kind === "moving") {
    return (
      <SettingsDialog
        title={t("settings:general.chainDataMovingTitle")}
        actions={null}
      >
        <p role="status" className="flex items-center gap-3">
          <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-accent animate-spin" />
          {t(`settings:general.chainDataPhase.${step.phase}`)}
        </p>
      </SettingsDialog>
    );
  }

  if (step.kind === "moved") {
    return (
      <SettingsDialog
        title={t("settings:general.chainDataMovedTitle")}
        onClose={move.close}
        actions={
          <>
            <button
              className={DIALOG_BUTTON_CLASS.secondary}
              onClick={move.close}
            >
              {t("settings:general.chainDataKeepOld")}
            </button>
            <button
              className={DIALOG_BUTTON_CLASS.danger}
              onClick={() => void move.deleteOld()}
            >
              {t("settings:general.chainDataDeleteOld")}
            </button>
          </>
        }
      >
        <p>
          {t("settings:general.chainDataMovedBody", {
            size: formatBytes(step.oldSizeBytes),
          })}
        </p>
        <p className="font-mono text-xs break-all">{step.oldRoot}</p>
      </SettingsDialog>
    );
  }

  return null;
}

/**
 * Settings → General → Chain data: the folder geth stores the chain in, its
 * size, and moving it to another folder or drive.
 * @returns The section.
 */
export function ChainDataSettings(): JSX.Element {
  const { t } = useTranslation();
  const move = useChainDataMove();
  const title = t("settings:general.chainDataTitle");

  return (
    <SettingsGroup title={t("settings:general.data")}>
      <SettingRow
        title={title}
        description={
          <>
            <span className="block font-mono break-all">
              {move.info?.root ?? t("settings:general.chainDataLoading")}
            </span>
            {move.info && (
              <span className="block mt-1">
                {formatBytes(move.info.sizeBytes)}
              </span>
            )}
            {move.problem && (
              <span
                role="alert"
                className="block mt-2 text-red-600 dark:text-red-400"
              >
                {t(`settings:general.chainDataError.${move.problem}`)}
              </span>
            )}
          </>
        }
      >
        <div className="flex gap-2">
          <SettingButton onClick={() => void window.api.openDataFolder()}>
            {t("settings:general.chainDataOpen")}
          </SettingButton>
          <SettingButton onClick={() => void move.pickTarget()}>
            {t("settings:general.chainDataMove")}
          </SettingButton>
        </div>
      </SettingRow>
      <ChainDataMoveDialogs move={move} />
    </SettingsGroup>
  );
}
