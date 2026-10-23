import { PERCENT_MAX } from "../config/mining.constants";
import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { toEtaDuration } from "../model/sync-status.util";
import { usePeerHintKey } from "../lib/peer-hint.hook";
import type { SyncStatus } from "../model/sync-status.types";

const PERCENT_FRACTION_DIGITS = 1;

interface SyncProgressProps {
  sync: SyncStatus;
}

/**
 * Formats an ETA in seconds into a short localized duration (e.g. "1h 5m"),
 * rounded first so the text does not jump on every poll.
 * @param etaSeconds - The raw ETA in seconds.
 * @param locale - The active UI locale.
 * @returns The localized duration string.
 */
function formatEta(etaSeconds: number, locale: string): string {
  return new Intl.DurationFormat(locale, { style: "narrow" }).format(
    toEtaDuration(etaSeconds),
  );
}

/**
 * Status line for a node that is not yet synced: a peer warning, a waiting
 * message, or the block progress with a thin bar and optional ETA.
 * @param props - The derived sync status.
 * @returns The rendered sync progress block.
 */
function SyncProgress({ sync }: SyncProgressProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const peerHintKey = usePeerHintKey();

  if (sync.status === "no-peers") {
    return (
      <p className="text-sm text-amber-400 mt-2">
        {t(peerHintKey ?? "mining:hero.noPeers")}
      </p>
    );
  }

  const { currentBlock, highestBlock, progressPercent, etaSeconds } = sync;
  if (
    sync.status !== "syncing" ||
    currentBlock === null ||
    highestBlock === null ||
    progressPercent === null
  ) {
    return (
      <p className="text-sm text-yellow-400 mt-2">
        {t("mining:hero.syncingNetwork")}
      </p>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-sm text-yellow-400">
        {t("mining:hero.syncingBlocks", {
          current: currentBlock.toLocaleString(locale),
          highest: highestBlock.toLocaleString(locale),
          percent: progressPercent.toLocaleString(locale, {
            maximumFractionDigits: PERCENT_FRACTION_DIGITS,
          }),
        })}
      </p>
      <div
        className="mt-2 w-full h-1 rounded-full bg-slate-900/50 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={PERCENT_MAX}
        aria-valuenow={progressPercent}
      >
        <div
          className="h-full rounded-full bg-yellow-400 transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {etaSeconds !== null && (
        <p className="text-xs text-white/40 mt-1.5 font-mono">
          {t("mining:hero.syncEta", { time: formatEta(etaSeconds, locale) })}
        </p>
      )}
    </div>
  );
}

export { SyncProgress };
