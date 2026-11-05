import type {
  BootnodeSaveResult,
  BootnodeSettings,
  BootnodeState,
  BootnodeStatus,
} from "@bridge/types";

/**
 * Fetches the node list and whether a restart is still pending.
 * @returns The bootnode state.
 */
async function getBootnodeState(): Promise<BootnodeState> {
  return window.api.bootnode.get();
}

/**
 * Saves the node setting. Main validates it, adds new nodes as peers at once
 * and restarts the node only when a running bootnode was removed.
 * @param settings - The custom nodes and the defaults turned off.
 * @returns The new state, or why the setting was rejected.
 */
async function saveBootnodes(
  settings: BootnodeSettings,
): Promise<BootnodeSaveResult> {
  return window.api.bootnode.set(settings);
}

/**
 * Removes the custom nodes and turns every default back on.
 * @returns The new state.
 */
async function resetBootnodes(): Promise<BootnodeState> {
  return window.api.bootnode.reset();
}

/**
 * Checks TCP reachability and peer status of listed nodes.
 * @param enode - One listed node; omit to check them all.
 * @returns One status per checked node.
 */
async function probeBootnodes(enode?: string): Promise<BootnodeStatus[]> {
  return window.api.bootnode.probe(enode);
}

export { getBootnodeState, saveBootnodes, resetBootnodes, probeBootnodes };
