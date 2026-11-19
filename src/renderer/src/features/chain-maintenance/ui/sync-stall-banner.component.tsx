import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { SyncStallStep } from "@bridge/types";
import { useSyncStall } from "../lib/sync-stall.hook";
import { useChainResync } from "../lib/chain-resync.hook";
import { ChainResyncDialogs } from "./chain-resync-dialogs.component";

const TONE_PROGRESS =
  "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-100 dark:border-amber-900";
const ACTION_BUTTON =
  "px-3 py-1 rounded-md border border-current font-medium hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";
const TONE_ATTENTION =
  "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-200 dark:border-red-900";

/**
 * App-wide banner while the sync stall watchdog works: the automatic step
 * under way, then the hint that only a resync from genesis is left.
 * @returns The banner, or null while sync is healthy.
 */
export function SyncStallBanner(): JSX.Element | null {
  const { t } = useTranslation(["mining"]);
  const step = useSyncStall();
  const resync = useChainResync();
  // The dialogs outlive the banner: the stall clears once the resync starts.
  if (!step) return <ChainResyncDialogs resync={resync} />;

  const needsUser = step === SyncStallStep.NEEDS_RESYNC;
  return (
    <div
      role={needsUser ? "alert" : "status"}
      aria-atomic="true"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm border-b shrink-0 ${needsUser ? TONE_ATTENTION : TONE_PROGRESS}`}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium">
          {needsUser
            ? t("mining:syncStall.title")
            : t("mining:syncStall.recovering")}
        </p>
        <p className="opacity-90">{t(`mining:syncStall.step.${step}`)}</p>
      </div>
      {needsUser && (
        <button type="button" onClick={resync.open} className={ACTION_BUTTON}>
          {t("mining:syncStall.resync")}
        </button>
      )}
      <ChainResyncDialogs resync={resync} />
    </div>
  );
}
