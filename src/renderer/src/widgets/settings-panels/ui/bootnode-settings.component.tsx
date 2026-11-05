import {
  NODE_STATUS_POLL_MS,
  useBootnodeSettings,
  useBootnodeStatus,
} from "@/features/settings";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { BootnodeSaveError, BootnodeSource } from "@bridge/types";
import { AddBootnodeForm } from "./add-bootnode-form.component";
import { BootnodeFeedback } from "./bootnode-feedback.component";
import { BootnodeRow } from "./bootnode-row.component";

const MS_PER_SECOND = 1000;
const ICON_SIZE = 14;
const SECTION_TITLE =
  "text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3";
const CARD =
  "bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm";
const SECONDARY_BUTTON =
  "inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * The CointMU nodes the app connects to: each is a bootnode and a static
 * peer, so they back each other up. Shows each node's reachability, latency
 * and peer status (re-checked while this pane is open), and lets the user
 * add, remove, turn off and reset nodes.
 * @returns The Nodes section of the Network settings pane.
 */
export function BootnodeSettings(): JSX.Element {
  const { t } = useTranslation("settings");
  const settings = useBootnodeSettings();
  const { state, isSaving, rejection } = settings;
  const nodes = state?.nodes ?? [];
  const { statuses, checking, checkAll, checkNode } = useBootnodeStatus(
    nodes.map((node) => node.enode),
  );
  const enabledCount = nodes.filter((node) => node.isEnabled).length;
  const isChanged = state?.source === BootnodeSource.USER;

  return (
    <section>
      <h3 className={SECTION_TITLE}>{t("networkSettings.bootnodes.title")}</h3>
      <div className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-600 dark:text-gray-300">
              {t("networkSettings.bootnodes.desc")}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">
              {t("networkSettings.bootnodes.autoCheck", {
                seconds: NODE_STATUS_POLL_MS / MS_PER_SECOND,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void checkAll()}
            disabled={nodes.length === 0 || checking.size > 0}
            className={SECONDARY_BUTTON}
          >
            <RefreshCw
              size={ICON_SIZE}
              className={checking.size > 0 ? "motion-safe:animate-spin" : ""}
              aria-hidden="true"
            />
            {t("networkSettings.bootnodes.checkAll")}
          </button>
        </div>

        {state ? (
          <ul
            aria-label={t("networkSettings.bootnodes.title")}
            className="divide-y divide-slate-100 dark:divide-gray-800"
          >
            {nodes.map((node, index) => (
              <BootnodeRow
                key={node.enode}
                node={node}
                number={index + 1}
                status={statuses.get(node.enode)}
                isChecking={checking.has(node.enode)}
                isLocked={isSaving || (node.isEnabled && enabledCount === 1)}
                onCheck={() => void checkNode(node.enode)}
                onToggle={() =>
                  void settings.setNodeEnabled(node.enode, !node.isEnabled)
                }
                onRemove={() => void settings.removeNode(node.enode)}
              />
            ))}
          </ul>
        ) : (
          <p className="p-4 text-xs text-slate-500 dark:text-gray-400">
            {t("networkSettings.bootnodes.loading")}
          </p>
        )}

        <div className="p-4 space-y-3">
          <BootnodeFeedback
            rejection={rejection}
            notice={settings.notice}
            isRestartPending={state?.isRestartPending ?? false}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void settings.reset()}
              disabled={!isChanged || isSaving}
              className={SECONDARY_BUTTON}
            >
              <RotateCcw size={ICON_SIZE} aria-hidden="true" />
              {t("networkSettings.bootnodes.reset")}
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded-lg text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle
              width={16}
              height={16}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <p>{t("networkSettings.bootnodes.warning")}</p>
          </div>
        </div>
        <AddBootnodeForm
          isSaving={isSaving || !state}
          rejection={rejection === BootnodeSaveError.EMPTY ? null : rejection}
          onAdd={settings.addNode}
        />
      </div>
    </section>
  );
}
