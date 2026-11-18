import {
  type FormEvent,
  type JSX,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import type {
  SendConfirmResult,
  SendSummary as SendSummaryData,
} from "../model/send-confirm.types";
import { SendPasswordInput } from "./send-password-input.component";
import { SendSummary } from "./send-summary.component";

interface SendConfirmModalProps {
  summary: SendSummaryData;
  /** Settings → Security "ask for password on every send". */
  isPasswordRequired: boolean;
  onBack: () => void;
  /** Signs and broadcasts; resolves with where to show a failure, if any. */
  onConfirm: (password: string) => Promise<SendConfirmResult>;
}

/**
 * Second step of the send flow, stacked over the send form: a read-only review
 * plus, when the setting is on, the wallet password. A failed attempt keeps the
 * user here with the password cleared; Back and Escape return to the untouched
 * form. While sending, nothing can close it and it cannot submit twice.
 * @param props - The summary, password requirement and the back/confirm handlers.
 * @returns The confirm dialog overlay.
 */
function SendConfirmModal({
  summary,
  isPasswordRequired,
  onBack,
  onConfirm,
}: SendConfirmModalProps): JSX.Element {
  const { t } = useTranslation();
  const titleId = useId();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");
  const [isSending, setIsSending] = useState(false);
  // State updates are async; the ref blocks a second submit in the same tick.
  const isSendingRef = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const focusPrimary = (): void => {
    (isPasswordRequired ? passwordRef : confirmRef).current?.focus();
  };

  useEffect(focusPrimary, [isPasswordRequired]);

  const handlePasswordChange = (value: string): void => {
    setPassword(value);
    setPasswordError("");
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (isSendingRef.current) return;
    if (isPasswordRequired && !password) {
      setPasswordError(t("wallet:modals.send.passwordRequired"));
      return;
    }
    isSendingRef.current = true;
    setIsSending(true);
    setGeneralError("");
    const result = await onConfirm(password);
    // Never kept past an attempt, whatever its outcome.
    setPassword("");
    isSendingRef.current = false;
    setIsSending(false);
    if (result.isOk) return;
    if (result.field === "password") setPasswordError(result.message);
    else setGeneralError(result.message);
    requestAnimationFrame(focusPrimary);
  };

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!isSendingRef.current) onBack();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={isSending}
        onSubmit={(event) => void handleSubmit(event)}
        className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-slate-200 dark:border-gray-800 w-full max-w-md max-h-full overflow-y-auto p-8"
      >
        <h3
          id={titleId}
          className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-1"
        >
          {t("wallet:modals.sendConfirm.title")}
        </h3>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">
          {t("wallet:modals.sendConfirm.subtitle")}
        </p>

        <SendSummary summary={summary} />

        {isPasswordRequired && (
          <div className="mt-5">
            <SendPasswordInput
              ref={passwordRef}
              value={password}
              error={passwordError}
              isDisabled={isSending}
              onChange={handlePasswordChange}
            />
          </div>
        )}

        {generalError && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 rounded-xl border border-red-100 dark:border-red-900/50"
          >
            <AlertCircle
              width={14}
              height={14}
              className="flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="text-xs font-medium leading-relaxed">
              {generalError}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-6">
          <button
            type="button"
            onClick={onBack}
            disabled={isSending}
            className="py-3.5 bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("wallet:modals.sendConfirm.back")}
          </button>
          <button
            ref={confirmRef}
            type="submit"
            disabled={isSending}
            className="py-3.5 bg-accent text-white font-bold rounded-xl shadow-sm shadow-accent/20 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending
              ? t("wallet:modals.sendConfirm.sending")
              : t("wallet:modals.sendConfirm.confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}

export { SendConfirmModal };
export type { SendConfirmModalProps };
