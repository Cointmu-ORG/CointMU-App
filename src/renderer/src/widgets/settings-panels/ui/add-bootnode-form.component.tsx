import { useState, type FormEvent, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import type { BootnodeSaveError } from "@bridge/types";

// Mirrors MAX_LABEL_LENGTH in main, which validates it again.
const MAX_LABEL_LENGTH = 40;
const ICON_SIZE = 14;
const ENODE_INPUT_ID = "bootnode-enode";
const LABEL_INPUT_ID = "bootnode-label";
const HINT_ID = "bootnode-add-hint";
const ERROR_ID = "bootnode-add-error";
// A format example, the same in every language.
const ENODE_PLACEHOLDER = "enode://<node id>@<host>:30303";
const INPUT =
  "w-full min-h-9 px-2.5 py-1.5 text-xs bg-white dark:bg-gray-950 border rounded-lg text-slate-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60";
const FIELD_LABEL =
  "block text-xs font-bold text-slate-700 dark:text-gray-200 mb-1";

interface AddBootnodeFormProps {
  readonly isSaving: boolean;
  readonly rejection: BootnodeSaveError | null;
  /** Resolves true when main saved the node. */
  readonly onAdd: (enode: string, label: string) => Promise<boolean>;
}

/**
 * Form to add a node by enode, with an optional label. Main validates the
 * enode (format, secp256k1 key, no duplicate); its error shows under the field.
 * @param props - Saving state, the last rejection and the add action.
 * @returns The add-node form.
 */
export function AddBootnodeForm({
  isSaving,
  rejection,
  onAdd,
}: AddBootnodeFormProps): JSX.Element {
  const { t } = useTranslation("settings");
  const [enode, setEnode] = useState("");
  const [label, setLabel] = useState("");
  // The error is about what was submitted; editing either field hides it.
  const [isEditedSinceSubmit, setIsEditedSinceSubmit] = useState(false);
  const hasError = rejection !== null && !isEditedSinceSubmit;

  const edit = (setValue: (value: string) => void, value: string): void => {
    setValue(value);
    setIsEditedSinceSubmit(true);
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setIsEditedSinceSubmit(false);
    if (await onAdd(enode.trim(), label.trim())) {
      setEnode("");
      setLabel("");
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="p-4 space-y-3">
      <p className="text-xs font-bold text-slate-700 dark:text-gray-200">
        {t("networkSettings.bootnodes.addTitle")}
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <label htmlFor={LABEL_INPUT_ID} className={FIELD_LABEL}>
            {t("networkSettings.bootnodes.labelField")}
          </label>
          <input
            id={LABEL_INPUT_ID}
            value={label}
            maxLength={MAX_LABEL_LENGTH}
            disabled={isSaving}
            onChange={(event) => edit(setLabel, event.target.value)}
            className={`${INPUT} border-slate-200 dark:border-gray-700`}
          />
        </div>
        <div>
          <label htmlFor={ENODE_INPUT_ID} className={FIELD_LABEL}>
            {t("networkSettings.bootnodes.enodeField")}
          </label>
          <input
            id={ENODE_INPUT_ID}
            value={enode}
            required
            spellCheck={false}
            autoComplete="off"
            placeholder={ENODE_PLACEHOLDER}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${ERROR_ID} ${HINT_ID}` : HINT_ID}
            disabled={isSaving}
            onChange={(event) => edit(setEnode, event.target.value)}
            className={`${INPUT} font-mono ${hasError ? "border-red-400 dark:border-red-700" : "border-slate-200 dark:border-gray-700"}`}
          />
        </div>
      </div>
      {hasError && (
        <p
          id={ERROR_ID}
          role="alert"
          className="text-xs font-semibold text-red-600 dark:text-red-400"
        >
          {t(`networkSettings.bootnodes.errors.${rejection}`)}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={HINT_ID} className="text-xs text-slate-500 dark:text-gray-400">
          {t("networkSettings.bootnodes.addHint")}
        </p>
        <button
          type="submit"
          disabled={isSaving || enode.trim() === ""}
          className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={ICON_SIZE} aria-hidden="true" />
          {isSaving
            ? t("networkSettings.bootnodes.saving")
            : t("networkSettings.bootnodes.add")}
        </button>
      </div>
    </form>
  );
}
