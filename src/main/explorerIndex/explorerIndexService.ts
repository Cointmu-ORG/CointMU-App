import { app } from "electron";
import { join } from "node:path";
import { getNetworkId } from "../geth/networkConfig";
import { getRpcPort } from "../geth/ports";
import { BlockIndexer } from "./blockIndexer";
import { createHttpBlockSource } from "./blockSource";

const INDEX_DIR_NAME = "explorer-index";

let indexer: BlockIndexer | null = null;

/**
 * Opens the explorer block index of the active network, in
 * <userData>/explorer-index/<networkId> (separate from the geth chaindata), and
 * starts following the node. Call after loadNetworkId. When the index cannot
 * be created at all the explorer falls back to "unavailable" and the app runs on.
 */
export function startExplorerIndex(): void {
  if (indexer !== null) return;
  try {
    indexer = new BlockIndexer(
      join(app.getPath("userData"), INDEX_DIR_NAME, getNetworkId()),
      createHttpBlockSource(getRpcPort),
    );
    indexer.start();
  } catch (err) {
    console.error("[explorer-index] Could not open the block index:", err);
  }
}

/** @returns The running indexer, or null when it could not start. */
export function getExplorerIndex(): BlockIndexer | null {
  return indexer;
}

/** Stops the indexer and closes its database. */
export async function stopExplorerIndex(): Promise<void> {
  const running = indexer;
  indexer = null;
  await running?.stop();
}
