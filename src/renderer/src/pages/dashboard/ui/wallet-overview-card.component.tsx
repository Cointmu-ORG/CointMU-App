import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Wallet, Copy, ArrowUp, ArrowDown, Lock, Activity } from "lucide-react";

interface WalletOverviewCardProps {
  balance: string;
  abbrAddress: string;
  activeWalletAddress: string | null;
  walletLabel: string;
}

/**
 * Gradient hero card summarizing the active wallet: its label, abbreviated
 * address, node-reported balance, and the primary wallet quick actions.
 * @param props - The balance, abbreviated address, and full active address.
 * @returns The rendered wallet overview card.
 */
function WalletOverviewCard({
  balance,
  abbrAddress,
  activeWalletAddress,
  walletLabel,
}: WalletOverviewCardProps): JSX.Element {
  const { t } = useTranslation(["common", "dashboard"]);

  return (
    <div className="rounded-2xl bg-accent p-7 text-white relative overflow-hidden flex flex-col h-full">
      <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-white/5 blur-sm" />
      <div className="absolute -right-4 -bottom-8 w-40 h-40 rounded-full bg-white/5" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/90">
                {walletLabel}
              </p>
              <p
                className="text-xs text-white/60 font-mono"
                title={activeWalletAddress || undefined}
              >
                {abbrAddress}
              </p>
            </div>
          </div>

          <button className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-xs font-medium text-white/90 hover:bg-white/25 transition-colors">
            <Copy className="w-3 h-3" />
            {t("dashboard:walletOverview.copy")}
          </button>
        </div>

        <div className="mb-6">
          <div className="flex items-baseline gap-2.5">
            <span className="text-4xl font-bold tracking-tight">{balance}</span>
            <span className="text-lg font-semibold text-white/70">CMU</span>
          </div>
          <p className="text-sm text-white/50 mt-1">
            {t("dashboard:walletOverview.balanceFromNode")}
          </p>
        </div>

        <div className="mt-auto flex items-center gap-2.5">
          <button className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold text-white hover:bg-white/25 transition-colors">
            <ArrowUp className="w-3 h-3 text-white" strokeWidth={2.5} />
            {t("dashboard:walletOverview.send")}
          </button>
          <button className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold text-white hover:bg-white/25 transition-colors">
            <ArrowDown className="w-3 h-3 text-white" strokeWidth={2.5} />
            {t("dashboard:walletOverview.receive")}
          </button>
          <button className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold text-white hover:bg-white/25 transition-colors">
            <Lock className="w-3 h-3" />
            {t("dashboard:walletOverview.stake")}
          </button>
          <button className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold text-white hover:bg-white/25 transition-colors">
            <Activity className="w-3 h-3" />
            {t("dashboard:walletOverview.miningLive")}
          </button>
        </div>
      </div>
    </div>
  );
}

export { WalletOverviewCard };
export type { WalletOverviewCardProps };
