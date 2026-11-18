import { useId, type JSX, type Ref } from "react";
import { useTranslation } from "react-i18next";

interface SendPasswordInputProps {
  value: string;
  isDisabled: boolean;
  /** Shown under the field and announced; empty when there is none. */
  error: string;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
}

/**
 * The wallet password asked before every send (Settings → Security). It
 * decrypts the key locally for this one transaction and is never stored.
 * @param props - The typed value, disabled state, error, change handler and ref.
 * @returns The labelled password field.
 */
function SendPasswordInput({
  value,
  isDisabled,
  error,
  onChange,
  ref,
}: SendPasswordInputProps): JSX.Element {
  const { t } = useTranslation();
  const inputId = useId();
  const errorId = useId();
  const hasError = error !== "";
  return (
    <div>
      <label
        htmlFor={inputId}
        className="block text-xs font-bold text-slate-600 dark:text-gray-300 mb-1.5"
      >
        {t("wallet:modals.send.passwordLabel")}
      </label>
      <input
        ref={ref}
        id={inputId}
        type="password"
        autoComplete="current-password"
        value={value}
        disabled={isDisabled}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full px-3 py-2.5 rounded-xl border bg-white dark:bg-gray-950 text-sm text-slate-800 dark:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${
          hasError
            ? "border-red-400 dark:border-red-500/70"
            : "border-slate-200 dark:border-gray-700"
        }`}
      />
      {hasError && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export { SendPasswordInput };
