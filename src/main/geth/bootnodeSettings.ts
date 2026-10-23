import {
  BootnodeSaveError,
  type BootnodeState,
  type InvalidBootnodeEntry,
} from "../../bridge/types";
import {
  type BootnodeConfig,
  MAX_BOOTNODES,
  isBootnodeList,
  parseBootnodeList,
  resolveBootnodeConfig,
} from "./bootnode";

/** Store key of the user's bootnode list; only BOOTNODE_CHANNELS may write it. */
export const BOOTNODES_SETTING_KEY = "network.bootnodes";
const KEY_SEPARATOR = ".";
// Generous for MAX_BOOTNODES enodes (~150 chars each) plus separators.
const MAX_INPUT_LENGTH = 4096;

export interface SettingsReader {
  get(key: string): unknown;
}

export type BootnodeInputCheck =
  | { readonly isValid: true; readonly enodes: readonly string[] }
  | {
      readonly isValid: false;
      readonly error: BootnodeSaveError;
      readonly invalid: readonly InvalidBootnodeEntry[];
    };

function rejectInput(
  error: BootnodeSaveError,
  invalid: readonly InvalidBootnodeEntry[] = [],
): BootnodeInputCheck {
  return { isValid: false, error, invalid };
}

/**
 * Tells whether a generic settings write would touch the bootnode list: the
 * key itself, a path inside it, or a parent object such as "network" that
 * would replace it wholesale.
 * @param key - A dotted electron-store key.
 * @returns True when the write must go through BOOTNODE_CHANNELS instead.
 */
export function isBootnodeSettingKey(key: string): boolean {
  return (
    key === BOOTNODES_SETTING_KEY ||
    key.startsWith(`${BOOTNODES_SETTING_KEY}${KEY_SEPARATOR}`) ||
    BOOTNODES_SETTING_KEY.startsWith(`${key}${KEY_SEPARATOR}`)
  );
}

/**
 * Validates the text a user entered: one enode per line or comma-separated,
 * every entry a valid enode (format and secp256k1 key), at most MAX_BOOTNODES.
 * @param input - The raw value received over IPC.
 * @returns The enodes to save, or why the input was rejected.
 */
export function checkBootnodeInput(input: unknown): BootnodeInputCheck {
  if (typeof input !== "string") return rejectInput(BootnodeSaveError.EMPTY);
  if (input.length > MAX_INPUT_LENGTH) {
    return rejectInput(BootnodeSaveError.TOO_MANY);
  }
  const { enodes, invalid } = parseBootnodeList(input);
  if (invalid.length > 0) {
    return rejectInput(BootnodeSaveError.INVALID_ENODE, invalid);
  }
  if (enodes.length === 0) return rejectInput(BootnodeSaveError.EMPTY);
  if (enodes.length > MAX_BOOTNODES) {
    return rejectInput(BootnodeSaveError.TOO_MANY);
  }
  return { isValid: true, enodes };
}

/**
 * @param left - An enode list.
 * @param right - Another enode list.
 * @returns True when both list the same enodes in the same order.
 */
export function hasSameEnodes(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((enode, index) => enode === right[index])
  );
}

/**
 * Describes the bootnode setting for the renderer.
 * @param store - The settings store.
 * @param defaults - The build or fallback bootnodes.
 * @param running - The config the running geth uses, or null when the next
 * start will pick up the saved setting anyway (not started, or restarting).
 * @returns The active list, its source, the saved custom list, and whether
 * a restart is still needed to apply it.
 */
export function buildBootnodeState(
  store: SettingsReader,
  defaults: BootnodeConfig,
  running: BootnodeConfig | null,
): BootnodeState {
  const saved = store.get(BOOTNODES_SETTING_KEY);
  const next = resolveBootnodeConfig(saved, defaults);
  const active = running ?? next;
  return {
    activeEnodes: active.enodes,
    source: active.source,
    customEnodes: isBootnodeList(saved) ? saved : [],
    isRestartPending:
      running !== null && !hasSameEnodes(running.enodes, next.enodes),
  };
}
