import {
  BootnodeSaveError,
  type BootnodeSettings,
  type CustomBootnode,
} from "../../../bridge/types";
import { BootnodeConfigProblem, MAX_BOOTNODES, parseEnode } from "./bootnode";

/** Store key of the node setting; only BOOTNODE_CHANNELS may write it. */
export const BOOTNODES_SETTING_KEY = "network.bootnodes";
const KEY_SEPARATOR = ".";
/** Room for "Lab server 2 (backup)"; the row shows the host next to it. */
export const MAX_LABEL_LENGTH = 40;
// A label is one line of plain text: no C0 control characters or DEL.
const FIRST_PRINTABLE_CODE = 0x20;
const DELETE_CODE = 0x7f;

export const EMPTY_BOOTNODE_SETTINGS: BootnodeSettings = {
  custom: [],
  disabled: [],
};

export interface SettingsReader {
  get(key: string): unknown;
}

export interface SettingsWriter extends SettingsReader {
  set(key: string, value: unknown): void;
}

export type BootnodeSettingsCheck =
  | { readonly isValid: true; readonly settings: BootnodeSettings }
  | { readonly isValid: false; readonly error: BootnodeSaveError };

interface SavedSettings {
  readonly settings: BootnodeSettings;
  readonly problem: BootnodeConfigProblem | null;
}

function reject(error: BootnodeSaveError): BootnodeSettingsCheck {
  return { isValid: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeIdOf(enode: string): string {
  return parseEnode(enode)?.nodeId ?? enode;
}

/**
 * Tells whether a generic settings write would touch the node setting: the
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

function hasControlChar(text: string): boolean {
  return [...text].some((char) => {
    const code = char.charCodeAt(0);
    return code < FIRST_PRINTABLE_CODE || code === DELETE_CODE;
  });
}

function checkCustomNode(value: unknown): CustomBootnode | BootnodeSaveError {
  if (
    !isRecord(value) ||
    typeof value.enode !== "string" ||
    !parseEnode(value.enode)
  ) {
    return BootnodeSaveError.INVALID_ENODE;
  }
  const label = typeof value.label === "string" ? value.label.trim() : null;
  if (
    label === null ||
    label.length > MAX_LABEL_LENGTH ||
    hasControlChar(label)
  ) {
    return BootnodeSaveError.INVALID_LABEL;
  }
  return { enode: value.enode.trim(), label };
}

function checkCustomNodes(
  values: readonly unknown[],
  defaults: readonly string[],
): CustomBootnode[] | BootnodeSaveError {
  const seenIds = new Set(defaults.map(nodeIdOf));
  const custom: CustomBootnode[] = [];
  for (const value of values) {
    const node = checkCustomNode(value);
    if (typeof node === "string") return node;
    const nodeId = nodeIdOf(node.enode);
    if (seenIds.has(nodeId)) return BootnodeSaveError.DUPLICATE;
    seenIds.add(nodeId);
    custom.push(node);
  }
  return custom;
}

/**
 * Validates a node setting received over IPC or read from the store: every
 * custom enode valid (format and secp256k1 key) with a one-line label, no
 * node id twice, only defaults disabled, at least one node enabled, and at
 * most MAX_BOOTNODES nodes in all.
 * @param input - The untrusted setting.
 * @param defaults - The build or fallback enodes.
 * @returns The normalized setting, or why it was rejected.
 */
export function checkBootnodeSettings(
  input: unknown,
  defaults: readonly string[],
): BootnodeSettingsCheck {
  if (
    !isRecord(input) ||
    !Array.isArray(input.custom) ||
    !Array.isArray(input.disabled)
  ) {
    return reject(BootnodeSaveError.INVALID_ENODE);
  }
  if (input.custom.length + defaults.length > MAX_BOOTNODES) {
    return reject(BootnodeSaveError.TOO_MANY);
  }
  const custom = checkCustomNodes(input.custom, defaults);
  if (typeof custom === "string") return reject(custom);
  const requested: readonly unknown[] = input.disabled;
  if (!requested.every((enode) => defaults.some((item) => item === enode))) {
    return reject(BootnodeSaveError.INVALID_ENODE);
  }
  const disabled = defaults.filter((enode) => requested.includes(enode));
  if (custom.length === 0 && disabled.length === defaults.length) {
    return reject(BootnodeSaveError.EMPTY);
  }
  return { isValid: true, settings: { custom, disabled } };
}

/**
 * Converts the #70 format, a list of enodes that replaced the defaults. Its
 * entries become custom nodes next to the defaults, which now back each other
 * up; an entry that is already a default is dropped.
 */
function fromLegacyList(
  list: readonly unknown[],
  defaults: readonly string[],
): unknown {
  const defaultIds = new Set(defaults.map(nodeIdOf));
  return {
    custom: list
      .filter(
        (enode) =>
          typeof enode !== "string" || !defaultIds.has(nodeIdOf(enode)),
      )
      .map((enode) => ({ enode, label: "" })),
    disabled: [],
  };
}

/**
 * Reads the saved setting, in the current or the #70 format. It is validated
 * again because the settings file can be edited outside the app; an invalid
 * one is ignored as a whole.
 * @param value - The stored value.
 * @param defaults - The build or fallback enodes.
 * @returns The setting to apply and the problem with the saved one, if any.
 */
export function readBootnodeSettings(
  value: unknown,
  defaults: readonly string[],
): SavedSettings {
  if (value === undefined || value === null) {
    return { settings: EMPTY_BOOTNODE_SETTINGS, problem: null };
  }
  const input = Array.isArray(value) ? fromLegacyList(value, defaults) : value;
  const check = checkBootnodeSettings(input, defaults);
  return check.isValid
    ? { settings: check.settings, problem: null }
    : {
        settings: EMPTY_BOOTNODE_SETTINGS,
        problem: BootnodeConfigProblem.INVALID_USER_VALUE,
      };
}

/**
 * Rewrites a setting saved in the #70 format in the current one. Idempotent:
 * a setting already in the current format is left alone.
 * @param store - The settings store.
 * @param defaults - The build or fallback enodes.
 */
export function migrateBootnodeSetting(
  store: SettingsWriter,
  defaults: readonly string[],
): void {
  const saved = store.get(BOOTNODES_SETTING_KEY);
  if (!Array.isArray(saved)) return;
  store.set(
    BOOTNODES_SETTING_KEY,
    readBootnodeSettings(saved, defaults).settings,
  );
}
