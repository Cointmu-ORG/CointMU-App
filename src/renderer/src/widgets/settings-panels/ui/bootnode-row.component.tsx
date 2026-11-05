import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { BootnodeEntry, BootnodeStatus } from "@bridge/types";
import { RefreshCw, Trash2 } from "lucide-react";
import { BootnodeStatusLine } from "./bootnode-status.component";

const ICON_SIZE = 14;
// "enode://" plus the first and last characters of the 128-hex key.
const ID_START = "enode://".length;
const ID_HEAD_CHARS = 8;
const ID_TAIL_CHARS = 6;
const ACTION_BUTTON =
  "inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border text-xs font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";
const NEUTRAL =
  "bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700";
const DANGER =
  "bg-white dark:bg-gray-800 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30";

interface BootnodeRowProps {
  readonly node: BootnodeEntry;
  /** 1-based position, for the "Node N" name. */
  readonly number: number;
  readonly status: BootnodeStatus | undefined;
  readonly isChecking: boolean;
  /** True while saving, and for the last enabled node, which must stay on. */
  readonly isLocked: boolean;
  readonly onCheck: () => void;
  readonly onToggle: () => void;
  readonly onRemove: () => void;
}

function shortId(enode: string): string {
  const id = enode.slice(ID_START, enode.indexOf("@"));
  return `${id.slice(0, ID_HEAD_CHARS)}…${id.slice(-ID_TAIL_CHARS)}`;
}

/**
 * One node in the list: its name and host, default or custom, its status,
 * and the check, enable/disable (defaults) or remove (custom) actions.
 * @param props - The node, its status and the action callbacks.
 * @returns The list item.
 */
export function BootnodeRow(props: BootnodeRowProps): JSX.Element {
  const { node, number, status, isChecking, isLocked } = props;
  const { t } = useTranslation("settings");
  const name =
    node.label || t("networkSettings.bootnodes.nodeName", { number });
  const title = `${name} · ${node.host}`;
  const switchId = `bootnode-switch-${number}`;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div
        className={`min-w-0 flex-1 space-y-1.5 ${node.isEnabled ? "" : "opacity-60"}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p
            id={switchId}
            className="text-sm font-bold text-slate-800 dark:text-gray-100 break-all"
          >
            {title}
          </p>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300">
            {node.isDefault
              ? t("networkSettings.bootnodes.default")
              : t("networkSettings.bootnodes.custom")}
          </span>
          {!node.isEnabled && (
            <span className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">
              {t("networkSettings.bootnodes.status.disabled")}
            </span>
          )}
        </div>
        <p
          className="text-[11px] font-mono text-slate-500 dark:text-gray-400"
          title={node.enode}
        >
          {shortId(node.enode)}
        </p>
        <BootnodeStatusLine status={status} isChecking={isChecking} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={props.onCheck}
          disabled={isChecking}
          aria-label={t("networkSettings.bootnodes.checkNode", { name: title })}
          className={`${ACTION_BUTTON} ${NEUTRAL}`}
        >
          <RefreshCw
            size={ICON_SIZE}
            className={isChecking ? "motion-safe:animate-spin" : ""}
            aria-hidden="true"
          />
          {t("networkSettings.bootnodes.check")}
        </button>
        {node.isDefault ? (
          <button
            type="button"
            role="switch"
            aria-checked={node.isEnabled}
            aria-labelledby={switchId}
            disabled={isLocked}
            onClick={props.onToggle}
            className={`w-11 h-6 shrink-0 rounded-full flex items-center px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 ${node.isEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-gray-600"}`}
          >
            <span
              className={`w-5 h-5 bg-white rounded-full shadow-sm motion-safe:transition-transform ${node.isEnabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onRemove}
            disabled={isLocked}
            aria-label={t("networkSettings.bootnodes.removeNode", {
              name: title,
            })}
            className={`${ACTION_BUTTON} ${DANGER}`}
          >
            <Trash2 size={ICON_SIZE} aria-hidden="true" />
            {t("networkSettings.bootnodes.remove")}
          </button>
        )}
      </div>
    </li>
  );
}
