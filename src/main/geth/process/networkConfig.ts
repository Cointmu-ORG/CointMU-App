import { app } from "electron";
import { join } from "path";
import { GENESIS_BLOCK, type GenesisBlock } from "./genesis";

let GETH_NETWORK_ID =
  process.env.GETH_NETWORK_ID || String(GENESIS_BLOCK.config.chainId);

/** @returns The active network id, used as --networkid and the datadir leaf. */
export function getNetworkId(): string {
  return GETH_NETWORK_ID;
}

/**
 * Resolves the active chain id and records it as the authoritative network id
 * used for both genesis init and the geth spawn: a positive GETH_NETWORK_ID
 * environment value (development and CI test chains), else the genesis chain id.
 * @returns {void}
 */
export function loadNetworkId(): void {
  const envNetworkId = Number(process.env.GETH_NETWORK_ID);
  GETH_NETWORK_ID = String(
    Number.isFinite(envNetworkId) && envNetworkId > 0
      ? envNetworkId
      : GENESIS_BLOCK.config.chainId,
  );
}

/**
 * Builds the effective genesis block by applying the active chain id override to
 * the inlined canonical genesis constant.
 * @returns {GenesisBlock} The genesis block to initialize the chain with.
 */
export function buildGenesis(): GenesisBlock {
  return {
    ...GENESIS_BLOCK,
    config: { ...GENESIS_BLOCK.config, chainId: Number(GETH_NETWORK_ID) },
  };
}
const DEFAULT_DATA_ROOT = join(app.getPath("userData"), "cointmu-chaindata");

let dataRoot = DEFAULT_DATA_ROOT;

/**
 * @returns The data root used when the user never moved it:
 *   <userData>/cointmu-chaindata.
 */
export function defaultDataRoot(): string {
  return DEFAULT_DATA_ROOT;
}

/**
 * Points geth at another data root (Settings → General → Move…). Only call
 * it while geth is stopped.
 * @param root - Absolute folder, or null for the default.
 */
export function setDataRoot(root: string | null): void {
  dataRoot = root ?? DEFAULT_DATA_ROOT;
}

/**
 * @returns The folder holding the geth datadir of every network, its PID
 *   file and (inside each datadir) the chaindata quarantine.
 */
export function resolveDataRoot(): string {
  return dataRoot;
}

/**
 * Resolves the absolute geth data directory for the active network:
 * <data root>/<networkId>.
 * @returns {string} The absolute data directory path.
 */
export function resolveDataDir(): string {
  return join(dataRoot, GETH_NETWORK_ID);
}
