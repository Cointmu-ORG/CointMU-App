import { useEffect, useId, useRef, type JSX, type ReactNode } from "react";

interface SettingsDialogProps {
  title: string;
  children: ReactNode;
  /** The buttons, right-aligned; the first one gets focus. */
  actions: ReactNode;
  /** Escape and the backdrop call it; omit for a dialog that must not close. */
  onClose?: () => void;
}

/**
 * A small modal for settings flows (confirmations, progress).
 * @param props - Title, body, actions and close handler.
 * @returns The dialog over a dimmed backdrop.
 */
export function SettingsDialog({
  title,
  children,
  actions,
  onClose,
}: SettingsDialogProps): JSX.Element {
  const titleId = useId();
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    actionsRef.current?.querySelector("button")?.focus();
    if (!onClose) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-gray-800 max-w-md w-full mx-4"
      >
        <h3
          id={titleId}
          className="text-lg font-bold text-slate-800 dark:text-gray-100 mb-2"
        >
          {title}
        </h3>
        <div className="text-sm text-slate-600 dark:text-gray-400 mb-6 leading-relaxed space-y-2">
          {children}
        </div>
        <div
          ref={actionsRef}
          className="flex items-center gap-3 justify-end flex-wrap"
        >
          {actions}
        </div>
      </div>
    </div>
  );
}

const DIALOG_BUTTON =
  "px-4 py-2 text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";

/** Class names for dialog buttons, by role. */
export const DIALOG_BUTTON_CLASS = {
  secondary: `${DIALOG_BUTTON} text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800`,
  primary: `${DIALOG_BUTTON} bg-accent text-white hover:opacity-90`,
  danger: `${DIALOG_BUTTON} bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-500/20`,
} as const;
