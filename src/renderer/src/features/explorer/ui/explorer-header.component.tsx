import { type JSX } from "react";
import { useTranslation } from "react-i18next";

interface ExplorerHeaderProps {
  isConnected: boolean;
  networkHeight: string;
}

/**
 * Explorer header showing the network breadcrumb and the current block height
 * or a disconnected indicator.
 * @param props - Connection state and the formatted network height label.
 * @returns The rendered explorer header.
 */
function ExplorerHeader({
  isConnected,
  networkHeight,
}: ExplorerHeaderProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between px-8 py-4 bg-white/50 dark:bg-gray-950 border-b border-slate-100 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-widest uppercase text-slate-400 dark:text-gray-400">
          {t("explorer:header.network")}
        </span>
        <span className="text-slate-300 dark:text-gray-500">/</span>
        <span className="text-sm font-semibold text-slate-800 dark:text-gray-100">
          {t("explorer:header.explorer")}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded ${isConnected ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-500" : "bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400"}`}
        >
          {isConnected && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
          <span className="text-[10px] font-bold tracking-wide">
            {isConnected
              ? t("explorer:header.blockHeight", { height: networkHeight })
              : t("explorer:header.disconnected")}
          </span>
        </div>
      </div>
    </header>
  );
}

export { ExplorerHeader };
export type { ExplorerHeaderProps };
