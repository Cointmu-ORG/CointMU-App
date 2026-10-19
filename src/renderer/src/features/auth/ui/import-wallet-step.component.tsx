import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../model/auth.store";
import { FileText, ChevronRight, Key, Download } from "lucide-react";

interface ImportWalletStepProps {
  mode: "method" | "input";
  onSelectMethod: (method: "seed" | "privateKey") => void;
  onSelectKeystore?: () => void;
  onContinue: () => void;
  onBackToInitial: () => void;
  onBackToMethod: () => void;
}

/**
 * Import step covering both the recovery-method picker and the secret input. In
 * method mode it offers seed phrase or private key; in input mode it renders the
 * matching field. The selected method and input value are read from the
 * AuthFlow store.
 * @param props - The current mode, method selection, and navigation handlers.
 * @returns The rendered import wallet step.
 */
function ImportWalletStep({
  mode,
  onSelectMethod,
  onSelectKeystore,
  onContinue,
  onBackToInitial,
  onBackToMethod,
}: ImportWalletStepProps): JSX.Element {
  const { t } = useTranslation();
  const importMethod = useAuthStore((s) => s.importMethod);
  const inputValue = useAuthStore((s) => s.inputValue);
  const setInputValue = useAuthStore((s) => s.setInputValue);

  if (mode === "method") {
    return (
      <div className="w-full flex flex-col gap-4">
        <button
          onClick={() => onSelectMethod("seed")}
          className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-accent dark:hover:border-accent hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-gray-800 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-colors">
              <FileText width={20} height={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                {t("auth:importWallet.seedPhraseTitle")}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {t("auth:importWallet.seedPhraseDesc")}
              </p>
            </div>
          </div>
          <ChevronRight
            className="text-gray-300 dark:text-gray-600 group-hover:text-accent transition-colors"
            width={20}
            height={20}
            strokeWidth={2.5}
          />
        </button>

        <button
          onClick={() => onSelectMethod("privateKey")}
          className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-accent dark:hover:border-accent hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-gray-800 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
              <Key width={20} height={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                {t("auth:importWallet.privateKeyTitle")}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {t("auth:importWallet.privateKeyDesc")}
              </p>
            </div>
          </div>
          <ChevronRight
            className="text-gray-300 dark:text-gray-600 group-hover:text-accent transition-colors"
            width={20}
            height={20}
            strokeWidth={2.5}
          />
        </button>

        {onSelectKeystore && (
          <button
            onClick={onSelectKeystore}
            className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-accent dark:hover:border-accent hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-gray-800 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                <Download width={20} height={20} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-800 dark:text-white">
                  {t("auth:importWallet.keystoreTitle")}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {t("auth:importWallet.keystoreDesc")}
                </p>
              </div>
            </div>
            <ChevronRight
              className="text-gray-300 dark:text-gray-600 group-hover:text-accent transition-colors"
              width={20}
              height={20}
              strokeWidth={2.5}
            />
          </button>
        )}

        <button
          onClick={onBackToInitial}
          className="w-full mt-2 py-3.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {t("auth:importWallet.back")}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-5">
      {importMethod === "seed" ? (
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            {t("auth:importWallet.seedPhraseLabel")}
          </label>
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="w-full px-4 py-3 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent transition-all resize-none"
            rows={4}
            placeholder={t("auth:importWallet.seedPhrasePlaceholder")}
          />
        </div>
      ) : (
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            {t("auth:importWallet.privateKeyLabel")}
          </label>
          <input
            type="password"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="w-full px-4 py-3 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent transition-all"
            placeholder={t("auth:importWallet.privateKeyPlaceholder")}
          />
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBackToMethod}
          className="flex-1 py-3.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {t("auth:importWallet.back")}
        </button>
        <button
          onClick={onContinue}
          disabled={!inputValue.trim()}
          className="flex-1 py-3.5 bg-accent text-white rounded-xl text-sm font-bold hover:opacity-80 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("auth:importWallet.next")}
        </button>
      </div>
    </div>
  );
}

export { ImportWalletStep };
export type { ImportWalletStepProps };
