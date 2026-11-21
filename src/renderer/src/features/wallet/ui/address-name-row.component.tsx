import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import { AccountIcon } from "@/entities/account";

const ICON_PX = 32;
const ROUND_BUTTON =
  "flex-shrink-0 w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-gray-400 transition-all flex items-center justify-center shadow-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

interface AddressNameRowProps {
  address: string;
  name: string;
  isDisabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

/**
 * One saved name with its full address, so the user can verify it, and the
 * edit and remove actions.
 * @param props - The entry and its actions.
 * @returns The row.
 */
function AddressNameRow({
  address,
  name,
  isDisabled,
  onEdit,
  onRemove,
}: AddressNameRowProps): JSX.Element {
  const { t } = useTranslation();
  const editLabel = t("wallet:modals.addressNames.edit", { name });
  const removeLabel = t("wallet:modals.addressNames.remove", { name });

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50">
      <span className="flex-shrink-0 rounded-full overflow-hidden">
        <AccountIcon address={address} size={ICON_PX} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800 dark:text-gray-100 truncate">
          {name}
        </p>
        <p className="text-[11px] font-mono text-slate-500 dark:text-gray-400 break-all select-all">
          {address}
        </p>
      </div>
      <button
        type="button"
        disabled={isDisabled}
        onClick={onEdit}
        aria-label={editLabel}
        title={editLabel}
        className={`${ROUND_BUTTON} hover:text-accent hover:border-accent/30 hover:bg-accent/10`}
      >
        <Pencil width={14} height={14} strokeWidth={2.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={isDisabled}
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className={`${ROUND_BUTTON} hover:bg-red-50 hover:text-red-500 hover:border-red-200 dark:hover:bg-red-900/30 dark:hover:text-red-400`}
      >
        <Trash2 width={14} height={14} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}

export { AddressNameRow };
