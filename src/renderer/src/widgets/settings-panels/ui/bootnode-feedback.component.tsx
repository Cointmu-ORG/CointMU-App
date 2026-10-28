import { BootnodeNotice, type BootnodeRejection } from "@/features/settings";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { BootnodeSaveError } from "@bridge/types";

interface BootnodeFeedbackProps {
  readonly rejection: BootnodeRejection | null;
  readonly notice: BootnodeNotice | null;
}

const ERROR_TEXT = "text-xs text-red-600 dark:text-red-400";

/**
 * Explains the outcome of a bootnode save or reset: which entries main
 * rejected, or that the node is restarting with the new list.
 * @param props - The last rejection and notice from useBootnodeSettings.
 * @returns The feedback block, or null when there is nothing to say.
 */
export function BootnodeFeedback({
  rejection,
  notice,
}: BootnodeFeedbackProps): JSX.Element | null {
  const { t } = useTranslation("settings");

  if (rejection) {
    return (
      <div role="alert" className={ERROR_TEXT}>
        <p className="font-bold">
          {t(`settings:networkSettings.bootnodes.errors.${rejection.error}`)}
        </p>
        {rejection.error === BootnodeSaveError.INVALID_ENODE && (
          <ul className="mt-1 space-y-0.5 font-mono break-all">
            {rejection.invalid.map((entry) => (
              <li key={entry.position}>
                {t("settings:networkSettings.bootnodes.invalidEntry", {
                  position: entry.position,
                  value: entry.value,
                })}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  if (notice === BootnodeNotice.REQUEST_FAILED) {
    return (
      <p role="alert" className={ERROR_TEXT}>
        {t("settings:networkSettings.bootnodes.requestFailed")}
      </p>
    );
  }
  if (notice) {
    return (
      <p
        role="status"
        className="text-xs text-emerald-600 dark:text-emerald-400"
      >
        {t(`settings:networkSettings.bootnodes.notice.${notice}`)}
      </p>
    );
  }
  return null;
}
