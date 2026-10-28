import type { DerivedAccount } from "@/entities/account";
import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy } from "lucide-react";

interface ReceiveModalProps {
  activeAccount: DerivedAccount | undefined;
  copied: boolean;
  onCopy: () => void;
}

/**
 * Receive modal presenting the active account address as a QR code and a
 * copyable text string for receiving funds.
 * @param props - The active account, the copy flag, and the copy handler.
 * @returns The rendered receive modal body.
 */
function ReceiveModal({
  activeAccount,
  copied,
  onCopy,
}: ReceiveModalProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="p-8 text-center">
      <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-2">
        {t("wallet:modals.receive.title")}
      </h3>
      <p className="text-sm text-slate-500 dark:text-gray-400 mb-8">
        {t("wallet:modals.receive.subtitle")}
      </p>

      <div className="mx-auto w-56 h-56 bg-white p-2 rounded-lg border-2 border-slate-100 dark:border-transparent shadow-sm mb-8 flex items-center justify-center">
        {activeAccount?.address && (
          <QRCodeSVG value={activeAccount.address} className="w-full h-full" />
        )}
      </div>

      <div className="bg-slate-50 dark:bg-gray-800 border border-slate-100 dark:border-gray-700 rounded-xl p-4 mb-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-gray-400 mb-1">
          {t("wallet:modals.receive.yourAddress")}
        </p>
        <p className="text-sm font-mono text-slate-800 dark:text-gray-100 break-all">
          {activeAccount?.address}
        </p>
      </div>

      <button
        onClick={onCopy}
        className="w-full py-3.5 bg-accent text-white font-bold rounded-xl shadow-sm shadow-accent/20 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
      >
        {copied ? (
          <Check width={16} height={16} strokeWidth={2.5} />
        ) : (
          <Copy width={16} height={16} strokeWidth={2.5} />
        )}
        {copied
          ? t("wallet:modals.receive.copiedBtn")
          : t("wallet:modals.receive.copyBtn")}
      </button>
    </div>
  );
}

export { ReceiveModal };
export type { ReceiveModalProps };
