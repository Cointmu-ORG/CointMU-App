import type { JSX } from "react";
import { useTranslation } from "react-i18next";

/**
 * A custom frameless window title bar.
 * Enables dragging the window and provides native window controls.
 * @returns The CustomTitleBar component.
 */
export function CustomTitleBar(): JSX.Element {
  const { t } = useTranslation(["common"]);

  const handleMinimize = (): void => {
    window.api.window.minimize();
  };

  const handleClose = (): void => {
    window.api.window.close();
  };

  return (
    <div
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      className="flex items-center justify-between h-8 bg-white dark:bg-gray-950 dark:text-white select-none z-50 shrink-0"
    >
      <div className="flex-1" />
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          title={t("ui.window.minimize")}
          className="flex items-center justify-center w-12 h-full text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-800 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          title={t("ui.window.close")}
          className="flex items-center justify-center w-12 h-full text-slate-500 dark:text-gray-400 hover:bg-red-500 hover:text-white transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M5.707 5l3.646-3.646-.707-.707L5 4.293 1.354.646l-.707.707L4.293 5 .646 8.646l.707.707L5 5.707l3.646 3.646.707-.707L5.707 5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
