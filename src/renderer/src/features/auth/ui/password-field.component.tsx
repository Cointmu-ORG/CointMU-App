import { type JSX } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordFieldProps {
  label: string;
  value: string;
  placeholder: string;
  show: boolean;
  onChange: (value: string) => void;
  onToggleShow: () => void;
}

/**
 * Reusable password input with a label and an inline show/hide visibility
 * toggle. Centralizes the markup previously duplicated across the login,
 * new-password, and confirm-password fields.
 * @param props - The label, value, placeholder, visibility flag, and handlers.
 * @returns The rendered password field.
 */
function PasswordField({
  label,
  value,
  placeholder,
  show,
  onChange,
  onToggleShow,
}: PasswordFieldProps): JSX.Element {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 pr-12 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent transition-all"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          {show ? (
            <EyeOff width={18} height={18} />
          ) : (
            <Eye width={18} height={18} />
          )}
        </button>
      </div>
    </div>
  );
}

export { PasswordField };
export type { PasswordFieldProps };
