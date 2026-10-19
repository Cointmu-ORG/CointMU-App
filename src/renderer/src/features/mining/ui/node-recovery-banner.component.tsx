import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { NodeRecoveryStage, type NodeRecoveryEvent } from "@bridge/types";
import { useNodeRecovery } from "../lib/node-recovery.hook";

const ATTENTION_STAGES: ReadonlySet<string> = new Set([
  NodeRecoveryStage.BLOCKED,
  NodeRecoveryStage.FAILED,
]);

const TONE_ATTENTION =
  "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-200 dark:border-red-900";
const TONE_PROGRESS =
  "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-100 dark:border-amber-900";
const TONE_SUCCESS =
  "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-900";

/**
 * Picks the banner colour set for a recovery stage.
 * @param stage - The current recovery stage.
 * @returns Tailwind classes for background, text, and border.
 */
function resolveTone(stage: NodeRecoveryEvent["stage"]): string {
  if (ATTENTION_STAGES.has(stage)) return TONE_ATTENTION;
  if (stage === NodeRecoveryStage.RECOVERED) return TONE_SUCCESS;
  return TONE_PROGRESS;
}

/**
 * Resolves the i18n key of the suggested action for a stage, if any.
 * @param event - The current recovery event.
 * @returns The hint key, or null when the stage needs no action.
 */
function resolveHintKey(event: NodeRecoveryEvent): string | null {
  if (event.stage === NodeRecoveryStage.BLOCKED && event.reason) {
    return `mining:recovery.hint.${event.reason}`;
  }
  if (event.stage === NodeRecoveryStage.FAILED) {
    return "mining:recovery.hint.failed";
  }
  return null;
}

/**
 * Full-width banner reporting staged node recovery (retry, verify, quarantine,
 * resync) and blocking conditions, with a retry action when user input is needed.
 * @returns The banner, or null while the node is not in recovery.
 */
export function NodeRecoveryBanner(): JSX.Element | null {
  const { t } = useTranslation(["mining"]);
  const { event, isRetrying, retry } = useNodeRecovery();
  if (!event) return null;

  const needsAttention = ATTENTION_STAGES.has(event.stage);
  const hintKey = resolveHintKey(event);

  return (
    <div
      role={needsAttention ? "alert" : "status"}
      aria-live={needsAttention ? "assertive" : "polite"}
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm border-b shrink-0 ${resolveTone(event.stage)}`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium">
          {t(`mining:recovery.stage.${event.stage}`, {
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            backupName: event.backupName,
          })}
        </p>
        {hintKey && <p className="opacity-90">{t(hintKey)}</p>}
      </div>
      {needsAttention && (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={isRetrying}
          className="px-3 py-1 rounded-md border border-current font-medium hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {isRetrying
            ? t("mining:recovery.retrying")
            : t("mining:recovery.retry")}
        </button>
      )}
    </div>
  );
}
