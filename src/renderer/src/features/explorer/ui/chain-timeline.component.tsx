import { CHAIN_TIMELINE_TICK_INTERVAL_MS as TICK_INTERVAL_MS } from "../config/explorer.constants";
import { type JSX, useEffect, useState } from "react";
import { useAppStore } from "@/shared/model";
import { X, AlertTriangle, Check, Box } from "lucide-react";

interface BlockItem {
  number: number;
  hash: string;
  miner: string;
  timestamp: number;
  txCount: number;
}

interface ChainTimelineProps {
  blocks: BlockItem[];
  coinbase: string;
  isOnline: boolean;
  onBlockClick?: (blockNum: number) => void;
}

function formatAge(timestamp: number, now: number): string {
  const diff = Math.floor(now / 1000) - timestamp;
  if (diff < 0) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  if (m < 60) return `${m}m ${s}s ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/**
 * A horizontal timeline component rendering recent blocks as cards.
 * Highlights blocks mined by the local node automatically and newest block in blue.
 * @param {ChainTimelineProps} props - The network insights data.
 * @returns {JSX.Element} The rendered Chain Timeline row.
 */
export function ChainTimeline({
  blocks,
  isOnline,
  onBlockClick,
}: ChainTimelineProps): JSX.Element {
  const [now, setNow] = useState<number>(Date.now());
  const balances = useAppStore((s) => s.balances);

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

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-slate-200 dark:border-gray-800 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-gray-100">
            Chain timeline
          </h3>
          <p className="text-[10px] text-slate-400 dark:text-gray-400 mt-0.5">
            Latest 12 blocks — newest on the right
          </p>
        </div>
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded ${isOnline ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-500" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500"}`}
        >
          {isOnline ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          ) : (
            <X width={10} height={10} strokeWidth={3} />
          )}
          <span className="text-[10px] font-bold">
            {isOnline ? "Updating - 3s" : "Offline"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto pb-4 pt-2 hide-scrollbar">
        {!isOnline ? (
          <div className="w-full py-8 flex flex-col items-center justify-center text-center">
            <AlertTriangle
              className="text-red-300 mb-2"
              width={28}
              height={28}
              strokeWidth={1.5}
            />
            <p className="text-sm font-medium text-slate-500 dark:text-gray-400">
              Node is offline
            </p>
            <p className="text-xs text-slate-400 dark:text-gray-500 mt-1 max-w-xs">
              Please start the node or enable RPC in Settings to view network
              activity.
            </p>
          </div>
        ) : blocks.length > 0 ? (
          // Reverse blocks so newest is on the right
          [...blocks].reverse().map((block, index, arr) => {
            const isLatest = index === arr.length - 1;
            const isMinedByMe = checkIfMinedByMe(block.miner, balances);

            const cardStyle = isLatest
              ? "bg-accent border-accent/80 text-white shadow-accent/20"
              : isMinedByMe
                ? "bg-emerald-500 border-emerald-600 text-white shadow-emerald-500/20"
                : "bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-800 dark:text-gray-200 hover:border-slate-300 dark:hover:border-gray-600";

            const labelStyle = isLatest
              ? "text-blue-100 dark:text-white"
              : isMinedByMe
                ? "text-emerald-100"
                : "text-slate-400 dark:text-gray-400";
            const subLabelStyle = isLatest
              ? "text-blue-100 dark:text-white"
              : isMinedByMe
                ? "text-emerald-100"
                : "text-slate-500 dark:text-gray-400";

            return (
              <div
                key={block.hash}
                className="flex flex-col items-center flex-shrink-0 min-w-[70px]"
              >
                <div
                  className={`relative w-full rounded-xl border flex flex-col items-center justify-center py-3 mb-3 shadow-sm transition-transform hover:-translate-y-1 cursor-pointer ${cardStyle}`}
                  onClick={() => onBlockClick?.(block.number)}
                >
                  {isMinedByMe && (
                    <div className="absolute -top-2 -right-2 w-5 h-5 bg-white dark:bg-gray-900 rounded-full flex items-center justify-center shadow-sm border border-emerald-100 dark:border-emerald-900">
                      <Check
                        className="text-emerald-500"
                        width={12}
                        height={12}
                        strokeWidth={3}
                      />
                    </div>
                  )}
                  <span
                    className={`text-[8px] font-bold tracking-widest uppercase mb-1 ${labelStyle}`}
                  >
                    Block
                  </span>
                  <span className="text-sm font-bold font-mono">
                    #{block.number}
                  </span>
                  <span className={`text-[9px] mt-1 ${subLabelStyle}`}>
                    {block.txCount} tx
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-gray-400 whitespace-nowrap">
                  {formatAge(block.timestamp, now)}
                </span>
              </div>
            );
          })
        ) : (
          <div className="w-full py-8 flex flex-col items-center justify-center">
            <Box
              className="text-slate-300 mb-2"
              width={28}
              height={28}
              strokeWidth={1.5}
            />
            <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
              Awaiting network activity
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
