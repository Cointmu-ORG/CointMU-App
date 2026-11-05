import {
  BootnodeSource,
  type BootnodeEntry,
  type BootnodeSettings,
  type BootnodeState,
} from "../../../bridge/types";
import { type BootnodeConfig, parseEnode } from "./bootnode";
import {
  BOOTNODES_SETTING_KEY,
  type SettingsReader,
  readBootnodeSettings,
} from "./bootnodeSettings";

/**
 * Applies the saved setting to the defaults: enabled defaults first, then the
 * custom nodes. Every one is a bootnode and a static peer.
 * @param userValue - The stored setting.
 * @param defaults - The result of resolveBuildBootnodes.
 * @returns The enodes geth should use and where they came from.
 */
export function resolveBootnodeConfig(
  userValue: unknown,
  defaults: BootnodeConfig,
): BootnodeConfig {
  const { settings, problem } = readBootnodeSettings(
    userValue,
    defaults.enodes,
  );
  if (settings.custom.length === 0 && settings.disabled.length === 0) {
    return problem ? { ...defaults, problem } : defaults;
  }
  return {
    enodes: [
      ...defaults.enodes.filter((enode) => !settings.disabled.includes(enode)),
      ...settings.custom.map((node) => node.enode),
    ],
    source: BootnodeSource.USER,
    problem: null,
  };
}

/**
 * @param running - The enodes the running node was started with.
 * @param next - The enodes the saved setting asks for.
 * @returns True when a node was removed or disabled; it stays in the running
 * node's --bootnodes, so discovery keeps finding it until a restart.
 */
export function hasRemovedEnodes(
  running: readonly string[],
  next: readonly string[],
): boolean {
  return running.some((enode) => !next.includes(enode));
}

function toEntry(
  enode: string,
  fields: Omit<BootnodeEntry, "enode" | "host">,
): BootnodeEntry {
  return { enode, host: parseEnode(enode)?.host ?? "", ...fields };
}

/**
 * @param settings - The saved setting.
 * @param defaults - The build or fallback enodes.
 * @returns Every listed node, defaults first, enabled or not.
 */
export function listBootnodeEntries(
  settings: BootnodeSettings,
  defaults: readonly string[],
): BootnodeEntry[] {
  return [
    ...defaults.map((enode) =>
      toEntry(enode, {
        label: "",
        isDefault: true,
        isEnabled: !settings.disabled.includes(enode),
      }),
    ),
    ...settings.custom.map((node) =>
      toEntry(node.enode, {
        label: node.label,
        isDefault: false,
        isEnabled: true,
      }),
    ),
  ];
}

/**
 * Describes the node setting for the renderer.
 * @param store - The settings store.
 * @param defaults - The build or fallback bootnodes.
 * @param running - The config the running geth was started with, or null when
 * the next start picks up the saved setting anyway.
 * @returns The node list, its source, and whether a restart is still needed.
 */
export function buildBootnodeState(
  store: SettingsReader,
  defaults: BootnodeConfig,
  running: BootnodeConfig | null,
): BootnodeState {
  const saved = store.get(BOOTNODES_SETTING_KEY);
  const { settings } = readBootnodeSettings(saved, defaults.enodes);
  const next = resolveBootnodeConfig(saved, defaults);
  return {
    nodes: listBootnodeEntries(settings, defaults.enodes),
    source: next.source,
    isRestartPending:
      running !== null && hasRemovedEnodes(running.enodes, next.enodes),
  };
}
