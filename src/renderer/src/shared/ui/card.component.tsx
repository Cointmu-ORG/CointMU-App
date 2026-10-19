import { type HTMLAttributes, type JSX } from "react";
import { cn } from "@/shared/lib";

type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const BASE_CLASSES =
  "rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800";

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-5",
  md: "p-6",
  lg: "p-7",
};

/**
 * Surface container applying the standard rounded white card styling shared by
 * every workspace panel.
 * @param props - Card props including padding scale and native div attributes.
 * @returns The rendered card container.
 */
function Card({
  padding = "md",
  className,
  children,
  ...rest
}: CardProps): JSX.Element {
  return (
    <div
      className={cn(BASE_CLASSES, PADDING_CLASSES[padding], className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export { Card };
export type { CardProps, CardPadding };
