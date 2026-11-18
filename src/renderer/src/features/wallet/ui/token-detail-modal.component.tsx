import { type JSX, type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, EyeOff, X } from "lucide-react";
import { PrivateAmount } from "@/shared/ui";
import { assetLabel, formatAssetAmount } from "../lib/wallet-assets.util";
import {
  NATIVE_ASSET_ADDRESS,
  type WalletAsset,
} from "../model/wallet-asset.types";
import { TokenIcon } from "./token-icon.component";

interface TokenDetailModalProps {
  asset: WalletAsset;
  onClose: () => void;
  onHide: (asset: WalletAsset) => void;
  /** Extra controls under the details (the logo editor). */
  children?: ReactNode;
}

/**
 * Details of one asset: name, symbol, contract and balance. Tokens carry a
 * light warning that anyone can deploy one and copy another's name, and can
 * be hidden from here. Contract text is rendered as plain text only.
 * @param props - The asset and the modal actions.
 * @returns The modal.
 */
function TokenDetailModal({
  asset,
  onClose,
  onHide,
  children,
}: TokenDetailModalProps): JSX.Element {
  const { t } = useTranslation();
  const isNative = asset.address === NATIVE_ASSET_ADDRESS;
  const label = assetLabel(asset);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-gray-950/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-detail-title"
        className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-slate-200 dark:border-gray-800 w-full max-w-md max-h-[90vh] overflow-y-auto relative"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("wallet:modals.tokenDetail.close")}
          className="absolute top-5 right-5 text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
        >
          <X width={20} height={20} strokeWidth={2.5} />
        </button>

        <div className="p-8 space-y-5">
          <div className="flex items-center gap-4 min-w-0 pr-8">
            <TokenIcon
              address={asset.address}
              symbol={asset.symbol}
              size="lg"
            />
            <div className="min-w-0">
              <h3
                id="token-detail-title"
                className="text-xl font-bold text-slate-800 dark:text-gray-100 truncate"
              >
                {asset.name || label}
              </h3>
              <p className="text-sm font-semibold text-slate-400 dark:text-gray-400 truncate">
                {label}
              </p>
            </div>
          </div>

          <dl className="bg-slate-50 dark:bg-gray-950 border border-slate-100 dark:border-gray-800 rounded-xl px-4 py-1.5 divide-y divide-slate-200 dark:divide-gray-800 text-xs">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="font-semibold text-slate-500 dark:text-gray-400">
                {t("wallet:modals.tokenDetail.balance")}
              </dt>
              <dd className="font-mono font-bold text-slate-700 dark:text-gray-200">
                <PrivateAmount>
                  {formatAssetAmount(asset.balance, asset.decimals)}
                </PrivateAmount>{" "}
                {label}
              </dd>
            </div>
            {!isNative && (
              <div className="py-2.5">
                <dt className="font-semibold text-slate-500 dark:text-gray-400 mb-1">
                  {t("wallet:modals.tokenDetail.contract")}
                </dt>
                <dd className="font-mono text-slate-700 dark:text-gray-200 break-all select-all">
                  {asset.address}
                </dd>
              </div>
            )}
          </dl>

          {!isNative && (
            <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 rounded-xl border border-amber-100 dark:border-amber-900/50">
              <AlertTriangle
                width={14}
                height={14}
                className="flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="text-xs font-medium leading-relaxed">
                {t("wallet:modals.tokenDetail.spoofWarning")}
              </p>
            </div>
          )}

          {children}

          {!isNative && (
            <button
              type="button"
              onClick={() => onHide(asset)}
              className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 dark:text-gray-200 bg-slate-100 dark:bg-gray-800 rounded-xl hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors"
            >
              <EyeOff
                width={14}
                height={14}
                strokeWidth={2.25}
                aria-hidden="true"
              />
              {t("wallet:modals.tokenDetail.hide")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { TokenDetailModal };
export type { TokenDetailModalProps };
