import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { useBootnodeSettings } from "../lib/bootnode-settings.hook";
import { BootnodeFeedback } from "./bootnode-feedback.component";

const SECTION_TITLE =
  "text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3";
const CARD =
  "bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm";
const SECONDARY_BUTTON =
  "px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const PRIMARY_BUTTON =
  "px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const TEXTAREA_ID = "bootnode-list";
const TEXTAREA_HINT_ID = "bootnode-list-hint";
const TEXTAREA_ROWS = 4;
// A format example, the same in every language.
const ENODE_PLACEHOLDER = "enode://<node id>@<host>:30303";

/**
 * Advanced network setting for the bootnodes the node dials first: shows the
 * active list and its source, and lets the user save a custom list or go
 * back to the default. Saving restarts the node.
 * @returns The Advanced section of the Network settings pane.
 */
export function BootnodeSettings(): JSX.Element {
  const { t } = useTranslation("settings");
  const {
    state,
    draft,
    setDraft,
    isDirty,
    isSaving,
    rejection,
    notice,
    save,
    reset,
  } = useBootnodeSettings();
  const hasDraft = draft.trim() !== "";
  const hasCustom = (state?.customEnodes.length ?? 0) > 0;

  return (
    <section>
      <h3 className={SECTION_TITLE}>
        {t("settings:networkSettings.advanced")}
      </h3>
      <div className={CARD}>
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                {t("settings:networkSettings.bootnodes.title")}
              </p>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                {t("settings:networkSettings.bootnodes.desc")}
              </p>
            </div>
            {state && (
              <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300">
                {t(`settings:networkSettings.bootnodes.source.${state.source}`)}
              </span>
            )}
          </div>
          <p className="text-xs font-bold text-slate-600 dark:text-gray-300">
            {t("settings:networkSettings.bootnodes.active")}
          </p>
          {state ? (
            <ul className="space-y-1 text-[11px] font-mono text-slate-700 dark:text-gray-300 break-all">
              {state.activeEnodes.map((enode) => (
                <li key={enode}>{enode}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400 dark:text-gray-500">
              {t("settings:networkSettings.bootnodes.loading")}
            </p>
          )}
          {state?.isRestartPending && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("settings:networkSettings.bootnodes.restartPending")}
            </p>
          )}
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle
              width={16}
              height={16}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <p>{t("settings:networkSettings.bootnodes.warning")}</p>
          </div>
          <div>
            <label
              htmlFor={TEXTAREA_ID}
              className="block text-xs font-bold text-slate-700 dark:text-gray-200 mb-1"
            >
              {t("settings:networkSettings.bootnodes.customLabel")}
            </label>
            <textarea
              id={TEXTAREA_ID}
              aria-describedby={TEXTAREA_HINT_ID}
              aria-invalid={rejection !== null}
              rows={TEXTAREA_ROWS}
              spellCheck={false}
              value={draft}
              disabled={!state || isSaving}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={ENODE_PLACEHOLDER}
              className="w-full p-2 text-[11px] font-mono bg-white dark:bg-gray-950 border border-slate-200 dark:border-gray-700 rounded-lg text-slate-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            />
            <p
              id={TEXTAREA_HINT_ID}
              className="text-xs text-slate-500 dark:text-gray-400 mt-1"
            >
              {t("settings:networkSettings.bootnodes.customHint")}
            </p>
          </div>
          <BootnodeFeedback rejection={rejection} notice={notice} />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void reset()}
              disabled={!hasCustom || isSaving}
              className={SECONDARY_BUTTON}
            >
              {t("settings:networkSettings.bootnodes.reset")}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!isDirty || !hasDraft || isSaving}
              className={PRIMARY_BUTTON}
            >
              {isSaving
                ? t("settings:networkSettings.bootnodes.saving")
                : t("settings:networkSettings.bootnodes.save")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
