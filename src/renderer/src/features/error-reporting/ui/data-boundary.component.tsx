import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Lock } from "lucide-react";

const SENT_KEYS = ["error", "stack", "versions", "node"] as const;
const NEVER_SENT_KEYS = ["secrets", "addresses", "identity"] as const;
const ICON_SIZE = 14;

export interface DataBoundaryProps {
  /** True when reports actually leave this computer (configured and on). */
  readonly isSending: boolean;
  readonly collectorHost: string | null;
}

/**
 * What stays on this computer versus what crosses to the collector, split by
 * a dashed line standing for the network boundary. The outgoing side fades
 * and says so when nothing is being sent.
 * @param props - Whether reports are sent, and where to.
 * @returns The two-sided data panel.
 */
export function DataBoundary({
  isSending,
  collectorHost,
}: DataBoundaryProps): JSX.Element {
  const { t } = useTranslation("settings");

  return (
    <div className="grid sm:grid-cols-2 text-xs">
      <div className="p-4">
        <p className="font-bold text-slate-800 dark:text-gray-100">
          {t("settings:privacy.neverSentTitle")}
        </p>
        <ul className="mt-3 space-y-2 text-slate-600 dark:text-gray-400">
          {NEVER_SENT_KEYS.map((key) => (
            <li key={key} className="flex gap-2">
              <Lock
                aria-hidden
                width={ICON_SIZE}
                height={ICON_SIZE}
                className="mt-px shrink-0 text-slate-400 dark:text-gray-500"
              />
              {t(`settings:privacy.neverSent.${key}`)}
            </li>
          ))}
        </ul>
      </div>

      <div
        className={`p-4 border-t sm:border-t-0 sm:border-l border-dashed border-slate-300 dark:border-gray-700 transition-opacity ${isSending ? "" : "opacity-60"}`}
      >
        <p className="font-bold text-slate-800 dark:text-gray-100">
          {t("settings:privacy.sentTitle")}
        </p>
        <p
          className={`mt-0.5 text-slate-500 dark:text-gray-400 ${isSending ? "font-mono text-[11px] break-all" : ""}`}
        >
          {isSending ? collectorHost : t("settings:privacy.sendingOff")}
        </p>
        <ul className="mt-3 space-y-2 text-slate-600 dark:text-gray-400">
          {SENT_KEYS.map((key) => (
            <li key={key} className="flex gap-2">
              <ArrowUpRight
                aria-hidden
                width={ICON_SIZE}
                height={ICON_SIZE}
                className={`mt-px shrink-0 ${isSending ? "text-emerald-500" : "text-slate-400 dark:text-gray-500"}`}
              />
              {t(`settings:privacy.sent.${key}`)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
