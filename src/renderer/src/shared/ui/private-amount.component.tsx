import type { JSX, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useDisplayPrefs } from "@/shared/model";

const MASK = "••••";

interface PrivateAmountProps {
  /** The balance or amount as it is shown without privacy mode. */
  children: ReactNode;
  /** False for someone else's amount (explorer), which is never masked. */
  isPrivate?: boolean;
}

/**
 * Shows a balance or amount, or •••• while privacy mode is on. Display
 * only: the value itself is untouched.
 * @param props - The value, and whether it is the user's own.
 * @returns The value or the mask.
 */
export function PrivateAmount({
  children,
  isPrivate = true,
}: PrivateAmountProps): JSX.Element {
  const { t } = useTranslation();
  const isPrivacyMode = useDisplayPrefs((s) => s.isPrivacyMode);
  if (!isPrivacyMode || !isPrivate) return <>{children}</>;
  return (
    <span role="img" aria-label={t("common:privacy.hiddenAmount")}>
      {MASK}
    </span>
  );
}
