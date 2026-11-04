import { LISTEN_PORT_RANGE, isListenPort } from "@bridge/network";
import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";

interface ListenPortRowProps {
  port: number;
  onSave: (port: number) => void;
}

/**
 * Network settings row for the P2P listen port. The value is saved on blur
 * or Enter once it is a valid port; main restarts the node to apply it. The
 * parent keys the row by the saved port, so a reset starts a fresh draft.
 * @param props - The saved port and the save callback.
 * @returns The listen port row.
 */
export function ListenPortRow({
  port,
  onSave,
}: ListenPortRowProps): JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(port));
  const draftPort = Number(draft);
  const isDraftValid = isListenPort(draftPort);

  const save = (): void => {
    if (isDraftValid && draftPort !== port) onSave(draftPort);
  };

  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div>
        <label
          htmlFor="listen-port"
          className="text-sm font-bold text-slate-800 dark:text-gray-100"
        >
          {t("settings:networkSettings.listenPortTitle")}
        </label>
        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
          {t("settings:networkSettings.listenPortDesc")}
        </p>
        {!isDraftValid && (
          <p
            id="listen-port-error"
            role="alert"
            className="text-xs font-medium text-red-600 dark:text-red-400 mt-1"
          >
            {t("settings:networkSettings.listenPortInvalid", LISTEN_PORT_RANGE)}
          </p>
        )}
      </div>
      <input
        id="listen-port"
        type="number"
        inputMode="numeric"
        min={LISTEN_PORT_RANGE.min}
        max={LISTEN_PORT_RANGE.max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        aria-invalid={!isDraftValid}
        aria-describedby={isDraftValid ? undefined : "listen-port-error"}
        className="w-28 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm font-bold font-mono text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
      />
    </div>
  );
}
