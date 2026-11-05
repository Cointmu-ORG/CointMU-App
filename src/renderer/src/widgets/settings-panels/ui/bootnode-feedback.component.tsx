import { BootnodeNotice } from "@/features/settings";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { BootnodeSaveError } from "@bridge/types";

interface BootnodeFeedbackProps {
  /** Only list-level rejections; the add form shows its own. */
  readonly rejection: BootnodeSaveError | null;
  readonly notice: BootnodeNotice | null;
  readonly isRestartPending: boolean;
}

const ERROR_TEXT = "text-xs text-red-600 dark:text-red-400";

/**
 * Explains the outcome of the last change to the node list, and a removal
 * that waits for the next node restart.
 * @param props - The last rejection and notice, and the pending restart.
 * @returns The feedback block, or null when there is nothing to say.
 */
export function BootnodeFeedback({
  rejection,
  notice,
  isRestartPending,
}: BootnodeFeedbackProps): JSX.Element | null {
  const { t } = useTranslation("settings");
  const restartText = isRestartPending && (
    <p className="text-xs text-amber-700 dark:text-amber-400">
      {t("networkSettings.bootnodes.restartPending")}
    </p>
  );

  if (rejection === BootnodeSaveError.EMPTY) {
    return (
      <p role="alert" className={ERROR_TEXT}>
        {t("networkSettings.bootnodes.errors.EMPTY")}
      </p>
    );
  }
  if (notice === BootnodeNotice.REQUEST_FAILED) {
    return (
      <p role="alert" className={ERROR_TEXT}>
        {t("networkSettings.bootnodes.requestFailed")}
      </p>
    );
  }
  return (
    <div role="status" className="space-y-1 empty:hidden">
      {notice && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          {t(`networkSettings.bootnodes.notice.${notice}`)}
        </p>
      )}
      {restartText}
    </div>
  );
}
