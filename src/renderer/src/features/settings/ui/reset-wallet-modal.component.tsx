import { RESET_CONFIRM_WORD } from "../config/settings.constants";
import { useState, type SyntheticEvent, type JSX } from "react";
import { AlertTriangle, Eye, EyeOff, X } from "lucide-react";
import { getSetting } from "@/features/settings";
import { verifyPassword, lockSession } from "@/features/wallet";

interface ResetWalletModalProps {
  onClose: () => void;
}

/**
 * Critical confirmation modal for wiping all wallet data. Requires the user to
 * type the confirmation word and their password. On confirm it verifies the
 * password, clears the persisted wallet data through the main process, locks the
 * session, and reloads the renderer so the app returns to onboarding.
 * @param props - The close handler that dismisses the modal.
 * @returns The rendered reset-wallet modal.
 */
export function ResetWalletModal({
  onClose,
}: ResetWalletModalProps): JSX.Element {
  const [confirmWord, setConfirmWord] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit =
    confirmWord === RESET_CONFIRM_WORD && password.length > 0 && !loading;

  const handleReset = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setError("");
    if (!canSubmit) return;
    setLoading(true);
    try {
      const encryptedPayload = await getSetting<string | null>(
        "encryptedPayload",
      );
      if (!encryptedPayload) {
        throw new Error("No wallet found to reset.");
      }
      const valid = await verifyPassword(encryptedPayload, password);
      if (!valid) {
        setError("Incorrect password.");
        setLoading(false);
        return;
      }
      const result = await window.api.clearAllData();
      if (!result.success) {
        throw new Error(result.error ?? "Failed to clear wallet data.");
      }
      lockSession();
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset wallet.");
      setLoading(false);
    }
  };

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
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center text-red-600 dark:text-red-400">
              <AlertTriangle width={20} height={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100">
              Reset wallet
            </h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">
            This permanently removes all accounts and keys from this device.
          </p>

          <div className="flex items-start gap-3 p-4 mb-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-400">
            <AlertTriangle width={18} height={18} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed font-medium">
              This action is irreversible. If you have not backed up your
              recovery phrase or private keys, your funds will be lost forever.
              CointMU cannot recover them for you.
            </p>
          </div>

          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-gray-400 mb-1.5">
                Type {RESET_CONFIRM_WORD} to confirm
              </label>
              <input
                type="text"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-sm text-slate-800 dark:text-gray-100 font-mono focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                placeholder={RESET_CONFIRM_WORD}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-gray-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-sm text-slate-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                  placeholder="Enter your wallet password"
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
              disabled={!canSubmit}
              className="w-full py-3.5 bg-red-600 text-white font-bold rounded-xl shadow-sm shadow-red-200 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Resetting..." : "Permanently reset wallet"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
