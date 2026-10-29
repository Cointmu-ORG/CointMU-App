import { app } from "electron";
import { join } from "path";
import { GENESIS_BLOCK, type GenesisBlock } from "../services/genesis";

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
const GETH_DATA_DIR = join(app.getPath("userData"), "cointmu-chaindata");

/**
 * @returns The folder holding the geth datadir of every network.
 */
export function resolveDataRoot(): string {
  return GETH_DATA_DIR;
}

/**
 * Resolves the absolute geth data directory for the active network:
 * <userData>/cointmu-chaindata/<networkId>.
 * @returns {string} The absolute data directory path.
 */
export function resolveDataDir(): string {
  return join(GETH_DATA_DIR, GETH_NETWORK_ID);
}
