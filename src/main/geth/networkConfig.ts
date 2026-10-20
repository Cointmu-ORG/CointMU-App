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
 * Replaces the active network id (the chain-id editor persists it separately).
 * @param {string} networkId - The new network id.
 * @returns {void}
 */
export function setNetworkId(networkId: string): void {
  GETH_NETWORK_ID = networkId;
}

/**
 * Resolves the active chain id and records it as the authoritative network id
 * used for both genesis init and the geth spawn. Resolution order is: a persisted
 * override (set by the chain-id editor), then the GETH_NETWORK_ID environment
 * value, then the inlined genesis default.
 * @param {any} store - The electron-store instance holding the optional override.
 * @returns {void}
 */
export function loadNetworkId(store: any): void {
  const override = Number(store.get("network.chainId"));
  const envNetworkId = Number(process.env.GETH_NETWORK_ID);
  GETH_NETWORK_ID = String(
    Number.isFinite(override) && override > 0
      ? override
      : Number.isFinite(envNetworkId) && envNetworkId > 0
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
 * Resolves the absolute geth data directory for the active network:
 * <userData>/cointmu-chaindata/<networkId>.
 * @returns {string} The absolute data directory path.
 */
export function resolveDataDir(): string {
  return join(GETH_DATA_DIR, GETH_NETWORK_ID);
}
