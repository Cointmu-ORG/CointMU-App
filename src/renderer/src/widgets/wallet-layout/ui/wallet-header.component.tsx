import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useAppStore } from "@/shared/model";

interface WalletHeaderProps {
  onAddAccount: () => void;
  onBackup: () => void;
}

/**
 * Wallet view header presenting the workspace breadcrumb, the node status pill
 * (the Dashboard's: Synced while the node answers, otherwise Offline), a
 * backup action, and the new account action.
 * @param props - Handlers for the add-account modal and the backup settings.
 * @returns The rendered wallet header.
 */
function WalletHeader({
  onAddAccount,
  onBackup,
}: WalletHeaderProps): JSX.Element {
  const { t } = useTranslation();
  const isConnected = useAppStore((s) => s.isConnected);

  return (
    <header className="flex items-center justify-between px-8 py-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-widest uppercase text-slate-400 dark:text-gray-400">
          {t("wallet:header.workspace")}
        </span>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-semibold text-slate-800 dark:text-gray-100">
          {t("wallet:header.title")}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {isConnected ? (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-500">
              {t("wallet:header.synced")}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-gray-950">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-xs font-semibold text-slate-500">
              {t("wallet:header.offline")}
            </span>
          </div>
        )}

        <button
          onClick={onBackup}
          className="flex items-center gap-2 px-5 py-2 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
        >
          {t("wallet:header.backup")}
        </button>

        <button
          onClick={onAddAccount}
          className="flex items-center gap-2 px-5 py-2 rounded-full bg-accent text-sm font-semibold text-white border border-transparent hover:opacity-90 transition-opacity shadow-sm shadow-accent/20"
        >
          <Plus width={12} height={12} strokeWidth={3} />
          {t("wallet:header.newAccount")}
        </button>
      </div>
    </header>
  );
}

export { WalletHeader };
export type { WalletHeaderProps };
