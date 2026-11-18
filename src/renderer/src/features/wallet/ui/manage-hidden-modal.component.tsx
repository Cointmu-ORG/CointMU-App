import type { DerivedAccount } from "@/entities/account";
import { type JSX, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Trash2 } from "lucide-react";
import { useHiddenTokensStore } from "../model/hidden-tokens.store";
import { assetLabel } from "../lib/wallet-assets.util";
import { TokenIcon } from "./token-icon.component";

interface ManageHiddenModalProps {
  accounts: DerivedAccount[];
  balances: Record<string, string>;
  onUnhideAccount: (address: string) => void;
  onDeleteAccount: (address: string) => void;
}

/**
 * Manage hidden accounts modal listing every hidden account and offering a
 * control to restore each one to the active sidebar.
 * @param props - All accounts and the unhide handler.
 * @returns The rendered manage hidden accounts modal body.
 */
function ManageHiddenModal({
  accounts,
  balances,
  onUnhideAccount,
  onDeleteAccount,
}: ManageHiddenModalProps): JSX.Element {
  const hiddenAccounts = accounts.filter((a) => a.isHidden);
  const hiddenTokens = useHiddenTokensStore((s) => s.hidden);
  const unhideToken = useHiddenTokensStore((s) => s.unhide);
  const { t } = useTranslation();

  const [accountToDelete, setAccountToDelete] = useState<DerivedAccount | null>(
    null,
  );

  return (
    <div className="p-8">
      <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-2">
        {t("wallet:modals.manageHidden.title")}
      </h3>
      <p className="text-sm text-slate-500 dark:text-gray-400 mb-8">
        {t("wallet:modals.manageHidden.subtitle")}
      </p>

      <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
        {hiddenAccounts.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-400 text-center py-8">
            {t("wallet:modals.manageHidden.noHidden")}
          </p>
        ) : (
          hiddenAccounts.map((acc, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50"
            >
              <div className="min-w-0 flex-1 pr-4">
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100 truncate">
                  {acc.label}
                </p>
                <p className="text-xs font-mono text-slate-500 dark:text-gray-400 truncate">
                  {acc.address}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onUnhideAccount(acc.address)}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-gray-400 hover:text-accent dark:hover:text-accent hover:border-accent/30 dark:hover:border-accent/30 hover:bg-accent/10 dark:hover:bg-accent/10 transition-all flex items-center justify-center shadow-sm"
                  title={t("wallet:modals.manageHidden.unhideTooltip")}
                >
                  <Eye width={14} height={14} strokeWidth={2.5} />
                </button>
                <button
                  onClick={() => setAccountToDelete(acc)}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all flex items-center justify-center shadow-sm"
                  title={t("wallet:modals.manageHidden.deleteTitle")}
                >
                  <Trash2 width={14} height={14} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {hiddenTokens.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-gray-400 mb-3">
            {t("wallet:modals.manageHidden.tokensTitle")}
          </h4>
          <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
            {hiddenTokens.map((token) => (
              <div
                key={token.address}
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50"
              >
                <TokenIcon address={token.address} symbol={token.symbol} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-gray-100 truncate">
                    {token.name || assetLabel(token)}
                  </p>
                  <p className="text-xs font-mono text-slate-500 dark:text-gray-400 truncate">
                    {token.address}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => unhideToken(token.address)}
                  aria-label={t("wallet:modals.manageHidden.unhideToken", {
                    symbol: assetLabel(token),
                  })}
                  title={t("wallet:modals.manageHidden.unhideToken", {
                    symbol: assetLabel(token),
                  })}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-gray-400 hover:text-accent hover:border-accent/30 hover:bg-accent/10 transition-all flex items-center justify-center shadow-sm"
                >
                  <Eye width={14} height={14} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {accountToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="w-full max-w-md p-6 bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-xl shadow-xl">
            <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              {t("wallet:modals.manageHidden.deleteTitle")}
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {parseFloat(balances[accountToDelete.address] || "0") === 0
                ? t("wallet:modals.manageHidden.confirmDeleteZero")
                : t("wallet:modals.manageHidden.confirmDeleteDust")}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setAccountToDelete(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                {t("wallet:modals.manageHidden.cancel")}
              </button>
              <button
                onClick={() => {
                  onDeleteAccount(accountToDelete.address);
                  setAccountToDelete(null);
                }}
                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                {t("wallet:modals.manageHidden.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { ManageHiddenModal };
export type { ManageHiddenModalProps };
