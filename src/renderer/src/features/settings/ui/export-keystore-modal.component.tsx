import type { DerivedAccount } from "@/entities/account";
import { useTranslation } from "react-i18next";
import { useEffect, useState, type SyntheticEvent, type JSX } from "react";
import { FileText, Eye, EyeOff, Check, X } from "lucide-react";
import { generateKeystore } from "@/features/wallet";
import { getSetting } from "@/shared/api";
import { useAppStore } from "@/shared/model";

interface ExportKeystoreModalProps {
  onClose: () => void;
}

/**
 * Password-gated modal that exports the active account as a standard Web3 Secret
 * Storage keystore JSON. It decrypts the account key, re-encrypts it under the
 * entered password, and hands the result to the main process to write through a
 * native save dialog.
 * @param props - The close handler that dismisses the modal.
 * @returns The rendered export-keystore modal.
 */
export function ExportKeystoreModal({
  onClose,
}: ExportKeystoreModalProps): JSX.Element {
  const { t } = useTranslation();
  const activeAccount = useAppStore((s) => s.activeAccount);

  const [accounts, setAccounts] = useState<DerivedAccount[]>([]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedPath, setSavedPath] = useState("");

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      const stored = (await getSetting<DerivedAccount[]>("accounts")) ?? [];
      if (active) setAccounts(stored);
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const handleExport = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setError("");
    const account =
      accounts.find((a) => a.address === activeAccount) ??
      (accounts.length > 0 ? accounts[0] : null);
    if (!account) {
      setError(t("settings:exportKeystoreModal.noAccount"));
      return;
    }
    if (!password) {
      setError(t("settings:securityModal.passwordRequired"));
      return;
    }
    setLoading(true);
    try {
      const keystoreJson = await generateKeystore(account, password);
      const filename = `cointmu-keystore-${account.address}.json`;
      const result = await window.api.saveKeystore(keystoreJson, filename, {
        title: t("common:dialog.exportKeystoreTitle"),
        filterName: t("common:dialog.jsonFilter"),
      });
      if (result.success && result.path) {
        setSavedPath(result.path);
      } else if (result.canceled) {
        setError(t("settings:exportKeystoreModal.canceled"));
      } else {
        setError(result.error ?? t("settings:exportKeystoreModal.saveFailed"));
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("settings:exportKeystoreModal.exportFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  const isDone = savedPath.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-slate-200 dark:border-gray-800 w-full max-w-md overflow-hidden relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
        >
          <X width={20} height={20} strokeWidth={2.5} />
        </button>

        <div className="p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center text-slate-600 dark:text-gray-300">
              <FileText width={20} height={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100">
              {t("settings:security.exportTitle")}
            </h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">
            {t("settings:exportKeystoreModal.description")}
          </p>

          {!isDone ? (
            <form onSubmit={handleExport} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-gray-400 mb-1.5">
                  {t("settings:securityModal.passwordLabel")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-sm text-slate-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder={t(
                      "settings:securityModal.passwordPlaceholder",
                    )}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff width={18} height={18} />
                    ) : (
                      <Eye width={18} height={18} />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs font-medium text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || accounts.length === 0}
                className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading
                  ? t("settings:exportKeystoreModal.exporting")
                  : t("settings:security.exportTitle")}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-700 dark:text-emerald-400">
                <Check
                  width={18}
                  height={18}
                  strokeWidth={2.5}
                  className="mt-0.5 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold">
                    {t("settings:exportKeystoreModal.saved")}
                  </p>
                  <p className="text-xs font-mono break-all mt-0.5">
                    {savedPath}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3.5 bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors"
              >
                {t("settings:securityModal.done")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
