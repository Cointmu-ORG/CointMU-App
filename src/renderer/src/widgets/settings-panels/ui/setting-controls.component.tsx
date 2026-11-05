import type { JSX, ReactNode } from "react";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";

interface SettingsGroupProps {
  title: string;
  children: ReactNode;
}

/**
 * A titled card of setting rows, as every settings pane draws them.
 * @param props - The section title and its rows.
 * @returns The section.
 */
export function SettingsGroup({
  title,
  children,
}: SettingsGroupProps): JSX.Element {
  return (
    <section>
      <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
        {title}
      </h3>
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
        {children}
      </div>
    </section>
  );
}

interface SettingRowProps {
  title: string;
  description?: ReactNode;
  /** The control, right-aligned. */
  children?: ReactNode;
}

/**
 * One setting: title and description on the left, its control on the right.
 * @param props - Texts and the control.
 * @returns The row.
 */
export function SettingRow({
  title,
  description,
  children,
}: SettingRowProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
          {title}
        </p>
        {description && (
          <div className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
            {description}
          </div>
        )}
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </div>
  );
}

interface SettingSwitchProps {
  checked: boolean;
  /** Accessible name; usually the row title. */
  label: string;
  onChange: (checked: boolean) => void;
}

/**
 * The pill switch used across settings, exposed as an ARIA switch.
 * @param props - State, accessible name and change handler.
 * @returns The switch.
 */
export function SettingSwitch({
  checked,
  label,
  onChange,
}: SettingSwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${FOCUS_RING} ${checked ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700"}`}
    >
      <span
        className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
}

interface SettingChoiceProps<T extends string | number> {
  value: T;
  options: readonly ChoiceOption<T>[];
  /** Accessible name of the group; usually the row title. */
  label: string;
  onChange: (value: T) => void;
}

/**
 * A segmented control for a few exclusive options (pressed = selected).
 * @param props - The selected value, options and change handler.
 * @returns The control.
 */
export function SettingChoice<T extends string | number>({
  value,
  options,
  label,
  onChange,
}: SettingChoiceProps<T>): JSX.Element {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center bg-slate-100 dark:bg-black/20 rounded-lg p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition-all ${FOCUS_RING} ${
            option.value === value
              ? "bg-white dark:bg-gray-800 text-slate-800 dark:text-gray-100 shadow-sm"
              : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SettingButtonProps {
  children: ReactNode;
  onClick: () => void;
  isDisabled?: boolean;
  tone?: "default" | "danger";
}

/**
 * The small bordered action button of a setting row.
 * @param props - Label, handler, disabled state and tone.
 * @returns The button.
 */
export function SettingButton({
  children,
  onClick,
  isDisabled = false,
  tone = "default",
}: SettingButtonProps): JSX.Element {
  const toneClass =
    tone === "danger"
      ? "text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40"
      : "text-slate-700 dark:text-gray-200 border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={`px-3 py-1.5 bg-white dark:bg-gray-800 border rounded-lg text-xs font-bold shadow-sm transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING} ${toneClass}`}
    >
      {children}
    </button>
  );
}
