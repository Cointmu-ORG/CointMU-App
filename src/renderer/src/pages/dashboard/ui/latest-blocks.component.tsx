import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { type BlockData, formatAge } from "@/shared/lib";
import { useAppStore } from "@/shared/model";
import { ChevronRight, Square, Box } from "lucide-react";

interface LatestBlocksProps {
  isConnected: boolean;
  recentBlocks: BlockData[];
  activeWalletAddress: string | null;
  onViewAll: () => void;
}

/**
 * Latest blocks panel listing the most recent blocks mined across the network,
 * flagging blocks credited to the active wallet.
 * @param props - Connection state, recent blocks, active address, and the
 * view-all navigation handler.
 * @returns The rendered latest blocks panel.
 */
function LatestBlocks({
  isConnected,
  recentBlocks,
  onViewAll,
}: LatestBlocksProps): JSX.Element {
  const balances = useAppStore((s) => s.balances);
  const { t, i18n } = useTranslation();

  const checkIfMinedByMe = (
    minerAddress: string,
    balancesMap: Record<string, string>,
  ): boolean => {
    if (!minerAddress || !balancesMap) return false;
    const allMyAddresses = Object.keys(balancesMap).map((addr) =>
      addr.toLowerCase(),
    );
    return allMyAddresses.includes(minerAddress.toLowerCase());
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100">
          {t("dashboard:latestBlocks.title")}
        </h3>
        <button
          onClick={onViewAll}
          className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-0.5"
        >
          {t("dashboard:latestBlocks.viewAll")}
          <ChevronRight width={10} height={10} strokeWidth={3} />
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mb-4">
        {t("dashboard:latestBlocks.minedAcrossNetwork")}
      </p>

      <div className="space-y-0">
        {(isConnected ? recentBlocks : []).slice(0, 10).map((block) => (
          <div
            key={block.hash}
            className="flex items-center justify-between py-3.5 border-t border-slate-100 dark:border-gray-800 first:border-t-0 hover:bg-slate-50/50 dark:hover:bg-gray-800 transition-colors px-2 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <Square className="text-accent" width={14} height={14} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800 dark:text-gray-100 font-mono">
                    #{block.number}
                  </span>
                  {checkIfMinedByMe(block.miner, balances) && (
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                      +2 CMU {t("dashboard:latestBlocks.mined")}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {block.hash.substring(0, 10)}...
                  {block.hash.substring(block.hash.length - 8)} -{" "}
                  {block.txCount} {t("dashboard:latestBlocks.txs")}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">
                {formatAge(block.timestamp, i18n.language)}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                {block.miner.substring(0, 8)}...
              </p>
            </div>
          </div>
        ))}

        {isConnected && recentBlocks.length === 0 && (
          <div className="py-8 flex flex-col items-center justify-center">
            <Box
              className="text-slate-300 mb-2"
              width={28}
              height={28}
              strokeWidth={1.5}
            />
            <p className="text-sm font-medium text-slate-400">
              {t("dashboard:latestBlocks.awaitingBlocks")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export { LatestBlocks };
export type { LatestBlocksProps };
