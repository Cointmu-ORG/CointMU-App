import { type DerivedAccount, AccountIcon } from "@/entities/account";
import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { ArrowUp, ArrowDown, RefreshCw, Check, Copy } from "lucide-react";

interface AccountHeroCardProps {
  activeAccount: DerivedAccount | undefined;
  balance: string;
  copied: boolean;
  onReceive: () => void;
  onSend: () => void;
  onCopy: () => void;
}

/**
 * Hero card for the selected account showing its identity, QR code, node-reported
 * balance, and the primary send, receive, swap, and copy actions.
 * @param props - The active account, gradient, balance, copy flag, and handlers.
 * @returns The rendered account hero card.
 */
function AccountHeroCard({
  activeAccount,
  balance,
  copied,
  onReceive,
  onSend,
  onCopy,
}: AccountHeroCardProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-slate-850 to-slate-950 p-7 text-white relative overflow-hidden">
      <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-white/3 blur-sm" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 rounded-full overflow-hidden w-16 h-16">
              <AccountIcon address={activeAccount?.address || ""} size={64} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">
                  {activeAccount?.label}
                </p>
                <span className="text-[9px] font-semibold tracking-wider uppercase text-white/50 bg-white/10 px-1.5 py-0.5 rounded">
                  EOA
                </span>
              </div>
              <p className="text-xs text-white/50 font-mono mt-0.5">
                {activeAccount?.address}
              </p>
            </div>
          </div>

          <div
            className="w-20 h-20 rounded-lg bg-white p-1.5 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={onReceive}
          >
            {activeAccount?.address ? (
              <QRCodeSVG
                value={activeAccount.address}
                className="w-full h-full"
              />
            ) : (
              <div className="w-full h-full bg-[repeating-conic-gradient(#000_0%_25%,#fff_0%_50%)] bg-[length:6px_6px] rounded-sm" />
            )}
          </div>
        </div>

        <div className="mb-5">
          <div className="flex items-baseline gap-2.5">
            <span className="text-4xl font-bold tracking-tight">{balance}</span>
            <span className="text-lg font-semibold text-white/60">CMU</span>
          </div>
          <p className="text-sm text-white/40 mt-1">
            {t("wallet:balanceFromNode")}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onSend}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-accent/20 backdrop-blur-sm text-xs font-semibold text-accent hover:bg-accent hover:text-white transition-colors"
          >
            <ArrowUp width={12} height={12} strokeWidth={2.5} />
            {t("wallet:send")}
          </button>
          <button
            onClick={onReceive}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-accent/20 backdrop-blur-sm text-xs font-semibold text-accent hover:bg-accent hover:text-white transition-colors"
          >
            <ArrowDown width={12} height={12} strokeWidth={2.5} />
            {t("wallet:receive")}
          </button>
          <button className="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-accent/20 backdrop-blur-sm text-xs font-semibold text-accent hover:bg-accent hover:text-white transition-colors">
            <RefreshCw width={12} height={12} />
            {t("wallet:swap")}
          </button>
          <button
            onClick={onCopy}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-accent/20 backdrop-blur-sm text-xs font-semibold text-accent hover:bg-accent hover:text-white transition-colors"
          >
            {copied ? (
              <Check width={12} height={12} />
            ) : (
              <Copy width={12} height={12} />
            )}
            {copied ? t("wallet:copied") : t("wallet:copyAddress")}
          </button>
        </div>
      </div>
    </div>
  );
}

export { AccountHeroCard };
export type { AccountHeroCardProps };
