import type { BootnodeSaveResult, BootnodeState } from "@bridge/types";

/**
 * Fetches the active bootnodes, their source and the saved custom list.
 * @returns The bootnode state.
 */
async function getBootnodeState(): Promise<BootnodeState> {
  return window.api.bootnode.get();
}

/**
 * Saves a custom bootnode list and restarts the node. Main validates every
 * entry; a rejected list leaves the saved one in place.
 * @param text - One enode per line or comma-separated.
 * @returns The new state, or why the list was rejected.
 */
async function saveBootnodes(text: string): Promise<BootnodeSaveResult> {
  return window.api.bootnode.set(text);
}

/**
 * Clears the custom list so the default bootnodes apply, and restarts the node.
 * @returns The new state.
 */
async function resetBootnodes(): Promise<BootnodeState> {
  return window.api.bootnode.reset();
}

export { getBootnodeState, saveBootnodes, resetBootnodes };
