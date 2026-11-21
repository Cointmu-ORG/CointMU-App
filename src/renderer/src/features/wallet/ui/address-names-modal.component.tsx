import { type FormEvent, type JSX, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { MAX_ADDRESS_NAME_LENGTH } from "@bridge/address-names";
import { useAddressNameStore } from "@/entities/address-name";
import { checkAddressNameForm } from "../lib/address-name-form.util";
import { AddressNameRow } from "./address-name-row.component";

const ERROR_KEY_PREFIX = "wallet:modals.addressNames.errors.";
const SAVE_FAILED_KEY = `${ERROR_KEY_PREFIX}saveFailed`;

interface AddressNamesModalProps {
  /** The wallet's own addresses, renamed on the account card instead. */
  ownAddresses: readonly string[];
}

const INPUT =
  "w-full px-3 py-2.5 bg-slate-50 dark:bg-gray-950 border border-slate-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent dark:text-white text-sm";

/**
 * Lists, adds, edits and removes the user's names for other addresses.
 * Names are labels on this device only; the full address stays visible and
 * is what a send uses.
 * @param props - The wallet's own addresses.
 * @returns The modal body.
 */
function AddressNamesModal({
  ownAddresses,
}: AddressNamesModalProps): JSX.Element {
  const { t } = useTranslation();
  const names = useAddressNameStore((s) => s.names);
  const ensureLoaded = useAddressNameStore((s) => s.ensureLoaded);
  const save = useAddressNameStore((s) => s.save);
  const remove = useAddressNameStore((s) => s.remove);
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  useEffect(ensureLoaded, [ensureLoaded]);

  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      console.error("Failed to save address names", err);
      setError(t(SAVE_FAILED_KEY));
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const result = checkAddressNameForm(address, name, ownAddresses);
    if ("error" in result) {
      setError(t(`${ERROR_KEY_PREFIX}${result.error}`));
      return;
    }
    if (await run(() => save(result.address, result.name))) {
      setAddress("");
      setName("");
    }
  };

  const entries = Object.entries(names).sort(([, a], [, b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="p-8">
      <h3 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-2">
        {t("wallet:modals.addressNames.title")}
      </h3>
      <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">
        {t("wallet:modals.addressNames.subtitle")}
      </p>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-3 mb-6"
        noValidate
      >
        <label className="block">
          <span className="block text-xs font-bold text-slate-700 dark:text-gray-200 mb-1.5">
            {t("wallet:modals.addressNames.addressLabel")}
          </span>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={isBusy}
            placeholder="0x..."
            spellCheck={false}
            className={`${INPUT} font-mono`}
          />
        </label>
        <label className="block">
          <span className="block text-xs font-bold text-slate-700 dark:text-gray-200 mb-1.5">
            {t("wallet:modals.addressNames.nameLabel")}
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isBusy}
            maxLength={MAX_ADDRESS_NAME_LENGTH}
            className={INPUT}
          />
        </label>
        {error !== null && (
          <p
            role="alert"
            className="flex items-start gap-2 text-xs font-medium text-red-600 dark:text-red-500"
          >
            <AlertCircle
              width={14}
              height={14}
              className="flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={isBusy}
          className="w-full py-2.5 text-sm font-semibold text-white bg-accent rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {t("wallet:modals.addressNames.save")}
        </button>
      </form>

      <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
        {entries.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            {t("wallet:modals.addressNames.empty")}
          </p>
        ) : (
          entries.map(([key, saved]) => (
            <AddressNameRow
              key={key}
              address={key}
              name={saved}
              isDisabled={isBusy}
              onEdit={() => {
                setAddress(key);
                setName(saved);
                setError(null);
              }}
              onRemove={() => void run(() => remove(key))}
            />
          ))
        )}
      </div>
    </div>
  );
}

export { AddressNamesModal };
