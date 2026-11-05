import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { BootnodeStatus } from "@bridge/types";
import {
  CheckCircle2,
  CircleDashed,
  Link2,
  Loader2,
  Unlink,
  XCircle,
} from "lucide-react";

const ICON_SIZE = 14;
const PILL =
  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border";
const TONE = {
  good: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-800",
  bad: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/30 dark:border-red-800",
  idle: "text-slate-600 bg-slate-50 border-slate-200 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700",
} as const;

interface BootnodeStatusProps {
  readonly status: BootnodeStatus | undefined;
  readonly isChecking: boolean;
}

function Reachability({
  status,
  isChecking,
}: BootnodeStatusProps): JSX.Element {
  const { t } = useTranslation("settings");
  if (isChecking && !status) {
    return (
      <span className={`${PILL} ${TONE.idle}`}>
        <Loader2
          size={ICON_SIZE}
          className="motion-safe:animate-spin"
          aria-hidden="true"
        />
        {t("networkSettings.bootnodes.checking")}
      </span>
    );
  }
  if (!status) {
    return (
      <span className={`${PILL} ${TONE.idle}`}>
        <CircleDashed size={ICON_SIZE} aria-hidden="true" />
        {t("networkSettings.bootnodes.status.unchecked")}
      </span>
    );
  }
  if (status.latencyMs === null) {
    return (
      <span className={`${PILL} ${TONE.bad}`}>
        <XCircle size={ICON_SIZE} aria-hidden="true" />
        {t("networkSettings.bootnodes.status.unreachable")}
      </span>
    );
  }
  return (
    <span className={`${PILL} ${TONE.good}`}>
      <CheckCircle2 size={ICON_SIZE} aria-hidden="true" />
      {t("networkSettings.bootnodes.status.reachable", {
        ms: status.latencyMs,
      })}
    </span>
  );
}

function Peer({
  status,
}: Pick<BootnodeStatusProps, "status">): JSX.Element | null {
  const { t } = useTranslation("settings");
  if (!status) return null;
  if (status.isPeer === null) {
    return (
      <span className={`${PILL} ${TONE.idle}`}>
        <Unlink size={ICON_SIZE} aria-hidden="true" />
        {t("networkSettings.bootnodes.peer.unknown")}
      </span>
    );
  }
  return status.isPeer ? (
    <span className={`${PILL} ${TONE.good}`}>
      <Link2 size={ICON_SIZE} aria-hidden="true" />
      {t("networkSettings.bootnodes.peer.connected")}
    </span>
  ) : (
    <span className={`${PILL} ${TONE.idle}`}>
      <Unlink size={ICON_SIZE} aria-hidden="true" />
      {t("networkSettings.bootnodes.peer.notConnected")}
    </span>
  );
}

/**
 * The checked state of one node: TCP reachability with latency, whether the
 * local node is peered with it, and when it was last checked.
 * @param props - The last status and whether a check is running.
 * @returns The status line.
 */
export function BootnodeStatusLine({
  status,
  isChecking,
}: BootnodeStatusProps): JSX.Element {
  const { t, i18n } = useTranslation("settings");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Reachability status={status} isChecking={isChecking} />
      <Peer status={status} />
      {status && (
        <span className="text-[11px] text-slate-500 dark:text-gray-400">
          {isChecking
            ? t("networkSettings.bootnodes.checking")
            : t("networkSettings.bootnodes.lastChecked", {
                time: new Date(status.checkedAtMs).toLocaleTimeString(
                  i18n.language,
                ),
              })}
        </span>
      )}
    </div>
  );
}
