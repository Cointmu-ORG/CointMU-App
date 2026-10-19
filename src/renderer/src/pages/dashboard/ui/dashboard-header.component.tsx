import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp } from "lucide-react";

interface DashboardHeaderProps {
  isConnected: boolean;
  onReceive: () => void;
  onSend: () => void;
}

/**
 * Dashboard header presenting the workspace breadcrumb, the node sync status
 * pill, and the primary receive and send actions.
 * @param props - Connection state and the receive and send action handlers.
 * @returns The rendered dashboard header.
 */
function DashboardHeader({
  isConnected,
  onReceive,
  onSend,
}: DashboardHeaderProps): JSX.Element {
  const { t } = useTranslation(["common", "dashboard"]);
  const syncLabel = isConnected
    ? t("dashboard:header.synced")
    : t("dashboard:header.offline");
  const syncDotColor = isConnected
    ? "bg-emerald-500 animate-pulse"
    : "bg-slate-400";
  const syncBorderColor = isConnected
    ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950"
    : "border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-950";
  const syncTextColor = isConnected ? "text-emerald-600" : "text-slate-500";

  return (
    <header className="flex items-center justify-between px-8 py-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-widest uppercase text-slate-400">
          {t("dashboard:header.workspace")}
        </span>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-semibold text-slate-800 dark:text-white">
          {t("dashboard:header.title")}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full border ${syncBorderColor}`}
        >
          <span className={`w-2 h-2 rounded-full ${syncDotColor}`} />
          <span className={`text-xs font-semibold ${syncTextColor}`}>
            {syncLabel}
          </span>
        </div>

        <button
          onClick={onReceive}
          className="flex items-center gap-2 px-5 py-2 rounded-full border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm font-medium text-slate-700 dark:text-gray-100 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowDown width={14} height={14} />
          {t("dashboard:header.receive")}
        </button>

        <button
          onClick={onSend}
          className="flex items-center gap-2 px-5 py-2 rounded-full bg-accent text-sm font-semibold text-white hover:opacity-80 transition-opacity shadow-sm shadow-accent/20"
        >
          <ArrowUp width={14} height={14} strokeWidth={2.5} />
          {t("dashboard:header.send")}
        </button>
      </div>
    </header>
  );
}

export { DashboardHeader };
export type { DashboardHeaderProps };
