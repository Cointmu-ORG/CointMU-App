import { useId, type JSX } from "react";
import { useTranslation } from "react-i18next";

interface SendPasswordInputProps {
  value: string;
  isDisabled: boolean;
  onChange: (value: string) => void;
}

/**
 * The wallet password asked before every send (Settings → Security). It
 * decrypts the key locally for this one transaction and is never stored.
 * @param props - The typed value, disabled state and change handler.
 * @returns The labelled password field.
 */
function SendPasswordInput({
  value,
  isDisabled,
  onChange,
}: SendPasswordInputProps): JSX.Element {
  const { t } = useTranslation();
  const inputId = useId();
  return (
    <div className="mt-4">
      <label
        htmlFor={inputId}
        className="block text-xs font-bold text-slate-600 dark:text-gray-300 mb-1.5"
      >
        {t("wallet:modals.send.passwordLabel")}
      </label>
      <input
        id={inputId}
        type="password"
        autoComplete="current-password"
        value={value}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-slate-800 dark:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
    </div>
  );
}

export { SendPasswordInput };
