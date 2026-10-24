import { useState, type SyntheticEvent, type JSX } from "react";
import { importKeystore } from "@/features/wallet";
import { FileText, Eye, EyeOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ImportKeystoreResult {
  privateKey: string;
  address: string;
}

interface ImportKeystoreModalProps {
  keystoreJson: string;
  onClose: () => void;
  onImported: (result: ImportKeystoreResult) => Promise<void> | void;
}

/**
 * Password-gated modal that decrypts a previously selected keystore JSON file.
 * It owns the password input and the isDecrypting state for the CPU-intensive
 * scrypt decryption, then delegates the decrypted key and address to the parent
 * through onImported. The parent is responsible for dismissing the modal once
 * the import has been handled.
 * @param props - The keystore JSON, the close handler, and the import callback.
 * @returns The rendered import-keystore modal.
 */
export function ImportKeystoreModal({
  keystoreJson,
  onClose,
  onImported,
}: ImportKeystoreModalProps): JSX.Element {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);

  const handleSubmit = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setError("");
    if (!password) {
      setError(t("wallet:modals.importKeystore.passwordRequired"));
      return;
    }
    setIsDecrypting(true);
    try {
      const result = await importKeystore(keystoreJson, password);
      await onImported(result);
    } catch {
      setError(t("wallet:modals.importKeystore.decryptFailed"));
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden relative">
        <button
          onClick={onClose}
          disabled={isDecrypting}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <X width={20} height={20} strokeWidth={2.5} />
        </button>

        <div className="p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <FileText width={20} height={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">
              {t("wallet:modals.importKeystore.title")}
            </h3>
          </div>
          <p className="text-sm text-slate-500 mb-6">
            {t("wallet:modals.importKeystore.description")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {t("wallet:modals.importKeystore.passwordLabel")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isDecrypting}
                  className="w-full px-4 py-3 pr-12 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                  placeholder={t(
                    "wallet:modals.importKeystore.passwordPlaceholder",
                  )}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
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
              disabled={isDecrypting}
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isDecrypting
                ? t("wallet:modals.importKeystore.decrypting")
                : t("wallet:modals.importKeystore.submit")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export type { ImportKeystoreResult };
