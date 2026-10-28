import { AUTO_HIDE_SECONDS } from "@/features/settings";
import { revealRecoveryPhrase } from "@/entities/wallet";
import { useTranslation } from "react-i18next";
import {
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
  type JSX,
} from "react";
import { Key, Eye, EyeOff, Copy, Check, AlertTriangle, X } from "lucide-react";

interface RecoveryPhraseModalProps {
  onClose: () => void;
}

/**
 * Password-gated modal that decrypts and displays the wallet's 12-word recovery
 * phrase. The phrase is held in component state, auto-hidden after a timer, and
 * scrubbed on unmount. As with the private key modal, scrubbing clears the
 * references rather than zeroing memory, which is the strongest guarantee
 * achievable in the renderer.
 * @param props - The close handler that dismisses the modal.
 * @returns The rendered recovery-phrase modal.
 */
export function RecoveryPhraseModal({
  onClose,
}: RecoveryPhraseModalProps): JSX.Element {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_HIDE_SECONDS);

  const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (autoHideRef.current) clearTimeout(autoHideRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const clearTimers = (): void => {
    if (autoHideRef.current) {
      clearTimeout(autoHideRef.current);
      autoHideRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const scrub = (): void => {
    clearTimers();
    setPhrase("");
    setPassword("");
    setCopied(false);
    setError("");
    setSecondsLeft(AUTO_HIDE_SECONDS);
  };

  const handleClose = (): void => {
    scrub();
    onClose();
  };

  const startAutoHide = (): void => {
    setSecondsLeft(AUTO_HIDE_SECONDS);
    autoHideRef.current = setTimeout(() => {
      handleClose();
    }, AUTO_HIDE_SECONDS * 1000);
    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
  };

  const handleReveal = async (event: SyntheticEvent): Promise<void> => {
    event.preventDefault();
    setError("");
    if (!password) {
      setError(t("settings:securityModal.passwordRequired"));
      return;
    }
    setLoading(true);
    try {
      const result = await revealRecoveryPhrase(password);
      setPhrase(result);
      startAutoHide();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("settings:recoveryPhraseModal.revealFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("settings:securityModal.copyFailed"));
    }
  };

  const isRevealed = phrase.length > 0;
  const words = isRevealed ? phrase.split(" ") : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-slate-200 dark:border-gray-800 w-full max-w-md overflow-hidden relative">
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
        >
          <X width={20} height={20} strokeWidth={2.5} />
        </button>

        <div className="p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center text-slate-600 dark:text-gray-300">
              <Key width={20} height={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100">
              {t("settings:security.recoveryPhraseTitle")}
            </h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">
            {t("settings:recoveryPhraseModal.description")}
          </p>

          <div className="flex items-start gap-3 p-4 mb-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-400">
            <AlertTriangle width={18} height={18} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed font-medium">
              {t("settings:recoveryPhraseModal.warning")}
            </p>
          </div>

          {!isRevealed ? (
            <form onSubmit={handleReveal} className="space-y-4">
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
                disabled={loading}
                className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading
                  ? t("settings:securityModal.verifying")
                  : t("settings:recoveryPhraseModal.reveal")}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {words.map((word, index) => (
                  <div
                    key={`${index}-${word}`}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg"
                  >
                    <span className="text-[10px] font-mono text-slate-400 w-4 text-right">
                      {index + 1}
                    </span>
                    <span className="text-sm font-mono font-semibold text-slate-800 dark:text-gray-100">
                      {word}
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-sm shadow-blue-200 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                {copied ? (
                  <Check width={16} height={16} strokeWidth={2.5} />
                ) : (
                  <Copy width={16} height={16} strokeWidth={2.5} />
                )}
                {copied
                  ? t("settings:securityModal.copied")
                  : t("settings:securityModal.copy")}
              </button>

              <p className="text-center text-xs text-slate-400 dark:text-gray-500">
                {t("settings:recoveryPhraseModal.autoHide", {
                  seconds: secondsLeft,
                })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
