import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useNodeStopWait } from "../lib/node-stop-wait.hook";

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const CLOCK_PAD = 2;

/**
 * @param durationMs - A duration.
 * @returns It as m:ss.
 */
function formatClock(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(CLOCK_PAD, "0")}`;
}

/**
 * Covers the window while a quit, restart or update waits for geth to finish
 * its startup repair: interrupting geth before that rewinds the chain (#101).
 * @returns The overlay, or null while no stop waits.
 */
export function NodeStopWaitOverlay(): JSX.Element | null {
  const { t } = useTranslation();
  const wait = useNodeStopWait();
  if (!wait) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="node-stop-wait-title"
      aria-describedby="node-stop-wait-body"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="w-[min(28rem,100%)] bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl shadow-lg p-5 flex gap-3">
        <Loader2
          className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-spin motion-reduce:animate-none"
          width={20}
          height={20}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p
            id="node-stop-wait-title"
            className="text-sm font-bold text-slate-800 dark:text-gray-100"
          >
            {t("common:nodeStopWait.title")}
          </p>
          <p
            id="node-stop-wait-body"
            className="text-xs text-slate-600 dark:text-gray-300 mt-1"
          >
            {t("common:nodeStopWait.body")}
          </p>
          <p
            role="timer"
            className="text-xs font-mono tabular-nums text-slate-500 dark:text-gray-400 mt-2"
          >
            {t("common:nodeStopWait.elapsed", {
              elapsed: formatClock(wait.elapsedMs),
              max: formatClock(wait.maxWaitMs),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
