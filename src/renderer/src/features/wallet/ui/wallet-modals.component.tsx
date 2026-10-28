import type { DerivedAccount } from "@/entities/account";
import { type JSX } from "react";
import { useWalletUiStore } from "../model/wallet-ui.store";
import { X } from "lucide-react";
import { ReceiveModal } from "./receive-modal.component";
import { SendModal } from "./send-modal.component";
import { AddAccountModal } from "./add-account-modal.component";
import { ManageHiddenModal } from "./manage-hidden-modal.component";

interface WalletModalsProps {
  accounts: DerivedAccount[];
  activeAccount: DerivedAccount | undefined;
  activeWalletAddress: string | null;
  copied: boolean;
  onClose: () => void;
  onCopy: () => void;
  onImportAccount: () => void;
  onImportKeystore: () => void;
  onUnhideAccount: (address: string) => void;
  onDeleteAccount: (address: string) => void;
  balances: Record<string, string>;
}

/**
 * Modal host for the wallet view. It renders the shared overlay and close
 * control, then dispatches to the active modal body based on the wallet UI store
 * modal state. Gas estimation and transfer logic are now fully owned by SendModal.
 * @param props - Account data and the modal action handlers.
 * @returns The rendered modal overlay, or null when no modal is open.
 */
function WalletModals({
  accounts,
  activeAccount,
  activeWalletAddress,
  copied,
  onClose,
  onCopy,
  onImportAccount,
  onImportKeystore,
  onUnhideAccount,
  onDeleteAccount,
  balances,
}: WalletModalsProps): JSX.Element | null {
  const modalState = useWalletUiStore((s) => s.modalState);
  const sendLoading = useWalletUiStore((s) => s.sendLoading);

  if (modalState === "NONE") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-slate-200 dark:border-gray-800 w-full max-w-md overflow-hidden relative">
        <button
          onClick={onClose}
          disabled={sendLoading}
          className="absolute top-5 right-5 text-slate-400 dark:text-gray-400 hover:text-slate-600 dark:hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <X width={20} height={20} strokeWidth={2.5} />
        </button>

        {modalState === "RECEIVE" && (
          <ReceiveModal
            activeAccount={activeAccount}
            copied={copied}
            onCopy={onCopy}
          />
        )}

        {modalState === "SEND" && (
          <SendModal
            activeAccount={activeAccount}
            activeWalletAddress={activeWalletAddress}
            accounts={accounts}
            onDone={onClose}
          />
        )}

        {modalState === "ADD_ACCOUNT" && (
          <AddAccountModal
            onImport={onImportAccount}
            onImportKeystore={onImportKeystore}
          />
        )}

        {modalState === "MANAGE_HIDDEN" && (
          <ManageHiddenModal
            accounts={accounts}
            balances={balances}
            onUnhideAccount={onUnhideAccount}
            onDeleteAccount={onDeleteAccount}
          />
        )}
      </div>
    </div>
  );
}

export { WalletModals };
export type { WalletModalsProps };
