import { AUTO_HIDE_SECONDS } from "@/features/settings";
import { revealPrivateKey } from "@/entities/wallet";
import type { DerivedAccount } from "@/entities/account";
import { useTranslation } from "react-i18next";
import {
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
  type JSX,
} from "react";
import { Key, Eye, EyeOff, Copy, Check, AlertTriangle, X } from "lucide-react";
import { getSetting } from "@/shared/api";
import { useAppStore } from "@/shared/model";

interface RevealPrivateKeyModalProps {
  onClose: () => void;
}

/**
 * Shortens an Ethereum address for compact display in the account selector.
 * @param address - The full 0x-prefixed address.
 * @returns The truncated address (first six and last four characters).
 */
function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Password-gated modal that reveals the raw private key for a selected account.
 * The key is held in component state, masked by default, and automatically
 * scrubbed both when a thirty-second timer elapses and when the component
 * unmounts. Because JavaScript strings are immutable the scrub clears the
 * references rather than zeroing the underlying memory, which is the strongest
 * guarantee achievable in the renderer process.
 * @param props - The close handler that dismisses the modal.
 * @returns The rendered reveal-private-key modal.
 */
export function RevealPrivateKeyModal({
  onClose,
}: RevealPrivateKeyModalProps): JSX.Element {
  const { t } = useTranslation();
  const activeAccount = useAppStore((s) => s.activeAccount);

  const [accounts, setAccounts] = useState<DerivedAccount[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [unmasked, setUnmasked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_HIDE_SECONDS);

  const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;
    const loadAccounts = async (): Promise<void> => {
      const stored = (await getSetting<DerivedAccount[]>("accounts")) ?? [];
      if (!active) return;
      setAccounts(stored);
      const fallback = stored.length > 0 ? stored[0].address : "";
      const initial = stored.some((a) => a.address === activeAccount)
        ? (activeAccount as string)
        : fallback;
      setSelectedAddress(initial);
    };
    loadAccounts();
    return () => {
      active = false;
    };
  }, [activeAccount]);

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
    setPrivateKey("");
    setPassword("");
    setUnmasked(false);
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
    const account = accounts.find((a) => a.address === selectedAddress);
    if (!account) {
      setError(t("settings:revealKeyModal.selectAccount"));
      return;
    }
    if (!password) {
      setError(t("settings:securityModal.passwordRequired"));
      return;
    }
    setLoading(true);
    try {
      const key = await revealPrivateKey(account, password);
      setPrivateKey(key);
      startAutoHide();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("settings:revealKeyModal.revealFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("settings:securityModal.copyFailed"));
    }
  };

  const isRevealed = privateKey.length > 0;

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
              {t("settings:security.revealTitle")}
            </h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">
            {t("settings:revealKeyModal.description")}
          </p>

          <div className="flex items-start gap-3 p-4 mb-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-400">
            <AlertTriangle width={18} height={18} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed font-medium">
              {t("settings:revealKeyModal.warning")}
            </p>
          </div>

          {!isRevealed ? (
            <form onSubmit={handleReveal} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-gray-400 mb-1.5">
                  {t("settings:revealKeyModal.accountLabel")}
                </label>
                <select
                  value={selectedAddress}
                  onChange={(e) => setSelectedAddress(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-sm text-slate-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                >
                  {accounts.length === 0 && (
                    <option value="">
                      {t("settings:revealKeyModal.noAccounts")}
                    </option>
                  )}
                  {accounts.map((a) => (
                    <option key={a.address} value={a.address}>
                      {a.label} - {shortenAddress(a.address)}
                    </option>
                  ))}
                </select>
              </div>

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
                  ? t("settings:securityModal.verifying")
                  : t("settings:security.revealTitle")}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-gray-400">
                    {t("settings:revealKeyModal.privateKeyLabel")}
                  </label>
                  <button
                    type="button"
                    onClick={() => setUnmasked((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  >
                    {unmasked ? (
                      <EyeOff width={14} height={14} />
                    ) : (
                      <Eye width={14} height={14} />
                    )}
                    {unmasked
                      ? t("settings:revealKeyModal.hide")
                      : t("settings:revealKeyModal.show")}
                  </button>
                </div>
                <div className="px-4 py-3 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl font-mono text-sm text-slate-800 dark:text-gray-100 break-all select-all">
                  {unmasked ? privateKey : "*".repeat(privateKey.length)}
                </div>
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
                {t("settings:revealKeyModal.autoHide", {
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
