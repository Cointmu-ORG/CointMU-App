import { type JSX, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { type DerivedAccount } from "@/features/wallet";
import { AccountIcon } from "@/features/wallet";
import { Plus, EyeOff } from "lucide-react";

const WATCH_LIST: never[] = [];

interface AccountSidebarProps {
  accounts: DerivedAccount[];
  activeWalletAddress: string | null;
  balances: Record<string, string>;
  onAccountSwitch: (address: string) => void;
  onHideAccount: (event: MouseEvent, address: string) => void;
  onDeriveAccount: () => void;
  onImportWallet: () => void;
  onManageHidden: () => void;
}

/**
 * Wallet accounts sidebar listing visible accounts with balances, the watch
 * list placeholder, and entry points for deriving, importing, and managing
 * hidden accounts.
 * @param props - Account data, the active address, balance, and action handlers.
 * @returns The rendered account sidebar.
 */
function AccountSidebar({
  accounts,
  activeWalletAddress,
  balances,
  onAccountSwitch,
  onHideAccount,
  onDeriveAccount,
  onImportWallet,
  onManageHidden,
}: AccountSidebarProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="w-64 flex-shrink-0 space-y-5">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-semibold tracking-[0.15em] uppercase text-gray-400">
            {t("wallet:sidebar.accounts")}
          </h3>
          <button
            onClick={onDeriveAccount}
            className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            <Plus width={14} height={14} strokeWidth={2.5} />
          </button>
        </div>

        <div className="space-y-1">
          {accounts
            .filter((a) => !a.isHidden)
            .map((acc, i) => {
              const abbrAddress = `${acc.address.substring(0, 6)}...${acc.address.substring(acc.address.length - 4)}`;
              const isSelected = acc.address === activeWalletAddress;

              return (
                <button
                  key={i}
                  onClick={() => onAccountSwitch(acc.address)}
                  className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 relative ${
                    isSelected
                      ? "bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 shadow-sm"
                      : "hover:bg-white/60 dark:hover:bg-gray-900/50 border border-transparent"
                  }`}
                >
                  <div className="flex-shrink-0 rounded-full overflow-hidden w-8 h-8">
                    <AccountIcon address={acc.address} size={32} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700 dark:text-gray-200 truncate">
                        {acc.label}
                      </p>
                      <p className="text-xs font-bold text-slate-800 dark:text-gray-100 ml-2 group-hover:opacity-0 transition-opacity">
                        {balances[acc.address] || "0.00"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p
                        className="text-[10px] text-slate-400 font-mono truncate"
                        title={acc.address}
                      >
                        {abbrAddress}
                      </p>
                      <p className="text-[10px] text-slate-400 group-hover:opacity-0 transition-opacity">
                        CMU
                      </p>
                    </div>
                  </div>

                  {!isSelected && (
                    <div
                      onClick={(e) => onHideAccount(e, acc.address)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600 dark:text-gray-300 dark:hover:text-white bg-white/80 dark:bg-gray-800/50 dark:hover:bg-gray-700/80 backdrop-blur-sm rounded-full p-1.5 shadow-sm"
                      title={t("wallet:sidebar.hideAccount")}
                    >
                      <EyeOff width={14} height={14} strokeWidth={2.5} />
                    </div>
                  )}
                </button>
              );
            })}
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-semibold tracking-[0.15em] uppercase text-slate-400 mb-3">
          {t("wallet:sidebar.watchList")}
        </h3>
        <div className="space-y-2">
          {WATCH_LIST.length > 0 ? (
            WATCH_LIST.map((_, i) => <div key={i} />)
          ) : (
            <p className="text-xs text-slate-400 px-3 py-2">
              {t("wallet:sidebar.noWatched")}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onImportWallet}
        className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors py-2"
      >
        {t("wallet:sidebar.importWallet")}
      </button>
      <button
        onClick={onManageHidden}
        className="w-full text-center text-[10px] font-medium text-slate-400 hover:text-slate-600 transition-colors py-1"
      >
        {t("wallet:sidebar.manageHidden")}
      </button>
    </div>
  );
}

export { AccountSidebar };
export type { AccountSidebarProps };
