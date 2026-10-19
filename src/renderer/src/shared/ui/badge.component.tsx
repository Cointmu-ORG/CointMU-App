import { type HTMLAttributes, type JSX } from "react";
import { cn } from "@/shared/lib";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const BASE_CLASSES =
  "inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral:
    "text-slate-500 dark:text-gray-300 bg-slate-100 dark:bg-gray-800 border-slate-200 dark:border-gray-700",
  success: "text-emerald-600 bg-emerald-50 border-emerald-200",
  warning: "text-amber-700 bg-amber-50 border-amber-200",
  danger: "text-red-600 bg-red-50 border-red-200",
  info: "text-blue-600 bg-blue-50 border-blue-200",
};

/**
 * Compact pill label used for inline status tags and counters.
 * @param props - Badge props including tone and native span attributes.
 * @returns The rendered badge element.
 */
function Badge({
  tone = "neutral",
  className,
  children,
  ...rest
}: BadgeProps): JSX.Element {
  return (
    <span className={cn(BASE_CLASSES, TONE_CLASSES[tone], className)} {...rest}>
      {children}
    </span>
  );
}

export { Badge };
export type { BadgeProps, BadgeTone };
