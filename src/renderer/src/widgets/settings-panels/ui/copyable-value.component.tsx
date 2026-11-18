import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { copySensitive } from "@/shared/api";

const COPIED_FEEDBACK_MS = 2_000;

interface CopyableValueProps {
  /** The text shown and copied. */
  value: string;
}

/**
 * A monospace value with a copy button that confirms the copy for a moment.
 * @param props - The value.
 * @returns The value and its button.
 */
export function CopyableValue({ value }: CopyableValueProps): JSX.Element {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) return undefined;
    const timer = setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);

  const handleCopy = (): void => {
    copySensitive(value)
      .then(() => setIsCopied(true))
      .catch((err: unknown) => {
        console.error("Failed to copy the value", err);
      });
  };

  const label = isCopied
    ? t("settings:otherConnections.copied")
    : t("settings:otherConnections.copy");
  const Icon = isCopied ? Check : Copy;
  return (
    <div className="flex items-center gap-2">
      <code className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-gray-800 text-xs font-mono text-slate-800 dark:text-gray-100 break-all">
        {value}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`${label}: ${value}`}
        title={label}
        className="p-1.5 rounded-lg text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 hover:text-slate-800 dark:hover:text-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Icon width={14} height={14} aria-hidden="true" />
      </button>
    </div>
  );
}
