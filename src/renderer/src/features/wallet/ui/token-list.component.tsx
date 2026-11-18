import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { EyeOff, Radar } from "lucide-react";
import type { TokenScanProgress } from "@bridge/types";
import { PrivateAmount, SkeletonTable } from "@/shared/ui";
import { assetLabel, formatAssetAmount } from "../lib/wallet-assets.util";
import {
  NATIVE_ASSET_ADDRESS,
  type WalletAsset,
} from "../model/wallet-asset.types";
import { TokenIcon } from "./token-icon.component";

const PERCENT = 100;

interface TokenListProps {
  assets: readonly WalletAsset[];
  scan: TokenScanProgress | null;
  isLoading: boolean;
  onSelect: (asset: WalletAsset) => void;
  onHide: (asset: WalletAsset) => void;
}

function ScanBanner({ scan }: { scan: TokenScanProgress }): JSX.Element {
  const { t } = useTranslation();
  const percent =
    scan.headBlock === null || scan.headBlock === 0
      ? 0
      : Math.floor((scan.scannedBlock / scan.headBlock) * PERCENT);
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-gray-800 bg-slate-50/60 dark:bg-gray-950/40">
      <Radar
        width={14}
        height={14}
        className="text-accent flex-shrink-0 motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <p className="text-xs text-slate-500 dark:text-gray-400 flex-1 min-w-0">
        {t("walletTabs:tokenScan.progress", {
          percent,
          block: scan.scannedBlock,
          head: scan.headBlock ?? 0,
        })}
      </p>
      <div
        role="progressbar"
        aria-label={t("walletTabs:tokenScan.label")}
        aria-valuemin={0}
        aria-valuemax={PERCENT}
        aria-valuenow={percent}
        className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-gray-800 overflow-hidden flex-shrink-0"
      >
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function AssetRow({
  asset,
  onSelect,
  onHide,
}: {
  asset: WalletAsset;
  onSelect: (asset: WalletAsset) => void;
  onHide: (asset: WalletAsset) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const label = assetLabel(asset);
  return (
    <tr className="hover:bg-slate-50/50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="px-5 py-3">
        <button
          type="button"
          onClick={() => onSelect(asset)}
          className="flex items-center gap-3 text-left min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <TokenIcon address={asset.address} symbol={asset.symbol} />
          <span className="min-w-0">
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-bold text-slate-800 dark:text-gray-100 truncate max-w-[12rem]">
                {asset.name || label}
              </span>
              {asset.isAutoDetected && (
                <span className="whitespace-nowrap px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-gray-800 text-[10px] font-semibold text-slate-500 dark:text-gray-400">
                  {t("walletTabs:autoDetected")}
                </span>
              )}
            </span>
            <span className="block text-xs font-semibold text-slate-400 dark:text-gray-400 truncate max-w-[12rem]">
              {label}
            </span>
          </span>
        </button>
      </td>
      <td className="px-5 py-3 text-right">
        <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 font-mono">
          N/A
        </p>
      </td>
      <td className="px-5 py-3 text-right">
        <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 font-mono">
          <PrivateAmount>
            {formatAssetAmount(asset.balance, asset.decimals)}
          </PrivateAmount>
        </p>
      </td>
      <td className="px-5 py-3 text-right">
        <p className="text-sm font-bold text-slate-800 dark:text-gray-100 font-mono">
          N/A
        </p>
      </td>
      <td className="px-3 py-3 text-right w-12">
        {asset.address !== NATIVE_ASSET_ADDRESS && (
          <button
            type="button"
            onClick={() => onHide(asset)}
            aria-label={t("walletTabs:hideToken", { symbol: label })}
            title={t("walletTabs:hideToken", { symbol: label })}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <EyeOff width={14} height={14} strokeWidth={2.25} />
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * The token table: CMU, manual and auto-detected tokens with their balances,
 * a hide control per token, and the initial scan progress while it runs.
 * Token names and symbols are rendered as plain text only.
 * @param props - Assets, scan progress and the row actions.
 * @returns The token table.
 */
function TokenList({
  assets,
  scan,
  isLoading,
  onSelect,
  onHide,
}: TokenListProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 overflow-hidden">
      {scan !== null && !scan.isComplete && <ScanBanner scan={scan} />}
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100 dark:border-gray-800">
            <th className="text-left px-5 py-3 text-[10px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
              {t("walletTabs:table.token")}
            </th>
            <th className="text-right px-5 py-3 text-[10px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
              {t("walletTabs:table.price")}
            </th>
            <th className="text-right px-5 py-3 text-[10px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
              {t("walletTabs:table.balance")}
            </th>
            <th className="text-right px-5 py-3 text-[10px] font-semibold tracking-wider uppercase text-slate-400 dark:text-gray-400">
              {t("walletTabs:table.value")}
            </th>
            <th className="w-12">
              <span className="sr-only">{t("walletTabs:table.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
          {isLoading ? (
            <tr>
              <td colSpan={5} className="p-0">
                <SkeletonTable columns={5} rowCount={3} />
              </td>
            </tr>
          ) : (
            assets.map((asset) => (
              <AssetRow
                key={asset.address}
                asset={asset}
                onSelect={onSelect}
                onHide={onHide}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export { TokenList };
export type { TokenListProps };
