import { type FormEvent, type JSX, type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pencil, X } from "lucide-react";
import {
  MAX_ADDRESS_NAME_LENGTH,
  normalizeAddressName,
} from "@bridge/address-names";

interface AccountLabelEditorProps {
  label: string;
  /** Rejects when the new label could not be saved. */
  onRename: (label: string) => Promise<void>;
}

const ICON_BUTTON =
  "w-6 h-6 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

/**
 * The account's name with an edit action. The name is a label only; the
 * address it belongs to never changes.
 * @param props - The current label and the save action.
 * @returns The label, or the form that edits it.
 */
function AccountLabelEditor({
  label,
  onRename,
}: AccountLabelEditorProps): JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const stopEditing = (): void => {
    setDraft(null);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const next = normalizeAddressName(draft ?? "");
    if (next === null) {
      setError(t("wallet:accountLabel.invalid"));
      return;
    }
    setIsSaving(true);
    try {
      await onRename(next);
      stopEditing();
    } catch (err) {
      console.error("Failed to rename the account", err);
      setError(t("wallet:accountLabel.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") stopEditing();
  };

  if (draft === null) {
    return (
      <div className="flex items-center gap-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{label}</p>
        <button
          type="button"
          onClick={() => setDraft(label)}
          aria-label={t("wallet:accountLabel.edit")}
          title={t("wallet:accountLabel.edit")}
          className={ICON_BUTTON}
        >
          <Pencil width={12} height={12} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          maxLength={MAX_ADDRESS_NAME_LENGTH}
          aria-label={t("wallet:accountLabel.inputLabel")}
          aria-invalid={error !== null}
          autoFocus
          className="w-44 px-2 py-1 text-sm font-semibold text-white bg-white/10 border border-white/20 rounded focus:outline-none focus:ring-2 focus:ring-white/60"
        />
        <button
          type="submit"
          disabled={isSaving}
          aria-label={t("wallet:accountLabel.save")}
          title={t("wallet:accountLabel.save")}
          className={ICON_BUTTON}
        >
          <Check width={14} height={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={stopEditing}
          aria-label={t("wallet:accountLabel.cancel")}
          title={t("wallet:accountLabel.cancel")}
          className={ICON_BUTTON}
        >
          <X width={14} height={14} aria-hidden="true" />
        </button>
      </div>
      {error !== null && (
        <p role="alert" className="text-[11px] text-red-300 mt-1">
          {error}
        </p>
      )}
    </form>
  );
}

export { AccountLabelEditor };
