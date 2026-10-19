import { type ButtonHTMLAttributes, type JSX, type ReactNode } from "react";
import { cn } from "@/shared/lib";

type ButtonVariant = "primary" | "danger" | "success" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
}

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:brightness-110 shadow-sm shadow-accent/20",
  danger: "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30",
  success:
    "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/30",
  secondary:
    "border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700",
  ghost: "bg-white/15 backdrop-blur-sm text-white hover:bg-white/25",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-xs",
  md: "px-5 py-2 text-sm",
  lg: "px-6 py-3 text-sm",
};

/**
 * Reusable pill button supporting semantic color variants, sizes, and an
 * optional leading icon. Presentational only; all behavior is delegated to the
 * native button element through spread props.
 * @param props - Button props including variant, size, and leftIcon.
 * @returns The rendered button element.
 */
function Button({
  variant = "primary",
  size = "md",
  leftIcon,
  className,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      className={cn(
        BASE_CLASSES,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
    </button>
  );
}

export { Button };
export type { ButtonProps, ButtonVariant, ButtonSize };
