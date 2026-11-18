import { type ChangeEvent, type JSX, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, ImageUp, RotateCcw } from "lucide-react";
import { localizeIpcError } from "@/shared/lib";
import {
  LogoFileError,
  checkLogoFile,
  reencodeLogo,
} from "../lib/logo-image.util";
import { useAssetLogoStore } from "../model/asset-logo.store";
import { TokenIcon } from "./token-icon.component";

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";
const ERROR_KEY_PREFIX = "wallet:modals.tokenDetail.logo.errors.";
const SAVE_FAILED_KEY = `${ERROR_KEY_PREFIX}saveFailed`;

interface AssetLogoEditorProps {
  /** "native" or a lowercase contract address. */
  assetKey: string;
  symbol: string;
}

const BUTTON =
  "flex-1 py-2.5 flex items-center justify-center gap-2 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const SECONDARY = `${BUTTON} text-slate-600 dark:text-gray-200 bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700`;

/**
 * Lets the user pick a PNG/JPEG/WebP logo for one asset, preview it after it
 * is cropped and re-encoded to a small square, then save it or go back to the
 * default. The file is checked by its bytes and size before it is decoded.
 * @param props - The asset key and symbol.
 * @returns The logo editor.
 */
function AssetLogoEditor({
  assetKey,
  symbol,
}: AssetLogoEditorProps): JSX.Element {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasCustomLogo = useAssetLogoStore((s) => assetKey in s.logos);
  const save = useAssetLogoStore((s) => s.save);
  const reset = useAssetLogoStore((s) => s.reset);
  const [preview, setPreview] = useState<string | null>(null);
  // Already translated: file checks and main-process codes use different namespaces.
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleFile = async (
    e: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setPreview(null);
    const problem = await checkLogoFile(file);
    if (problem !== null) {
      setError(t(`${ERROR_KEY_PREFIX}${problem}`));
      return;
    }
    try {
      setPreview(await reencodeLogo(file));
    } catch {
      setError(t(`${ERROR_KEY_PREFIX}${LogoFileError.UNREADABLE}`));
    }
  };

  const run = async (action: () => Promise<void>): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      setPreview(null);
    } catch (err) {
      setError(localizeIpcError(err, SAVE_FAILED_KEY));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="asset-logo-title"
      className="border border-slate-100 dark:border-gray-800 rounded-xl p-4 space-y-3"
    >
      <div>
        <h4
          id="asset-logo-title"
          className="text-xs font-bold text-slate-700 dark:text-gray-200"
        >
          {t("wallet:modals.tokenDetail.logo.title")}
        </h4>
        <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
          {t("wallet:modals.tokenDetail.logo.hint")}
        </p>
      </div>

      {preview !== null && (
        <div className="flex items-center gap-3">
          <TokenIcon address={assetKey} symbol={symbol} size="lg" />
          <span className="text-slate-400 text-xs" aria-hidden="true">
            →
          </span>
          <img
            src={preview}
            alt={t("wallet:modals.tokenDetail.logo.preview")}
            className="w-12 h-12 rounded-full object-cover"
          />
        </div>
      )}

      {error !== null && (
        <div
          role="alert"
          className="flex items-start gap-2 text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl border border-red-100 dark:border-red-900/50"
        >
          <AlertCircle
            width={14}
            height={14}
            className="flex-shrink-0 mt-0.5"
          />
          <p className="text-xs font-medium leading-relaxed">{error}</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={(e) => void handleFile(e)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="flex gap-2">
        {preview !== null ? (
          <>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void run(() => save(assetKey, preview))}
              className={`${BUTTON} bg-accent text-white hover:opacity-90`}
            >
              {t("wallet:modals.tokenDetail.logo.save")}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setPreview(null)}
              className={SECONDARY}
            >
              {t("wallet:modals.tokenDetail.logo.cancel")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => inputRef.current?.click()}
              className={SECONDARY}
            >
              <ImageUp width={14} height={14} aria-hidden="true" />
              {t("wallet:modals.tokenDetail.logo.upload")}
            </button>
            {hasCustomLogo && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void run(() => reset(assetKey))}
                className={SECONDARY}
              >
                <RotateCcw width={14} height={14} aria-hidden="true" />
                {t("wallet:modals.tokenDetail.logo.reset")}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export { AssetLogoEditor };
