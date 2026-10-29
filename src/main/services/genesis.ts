import { COINTMU_NETWORK } from "../../bridge/network";

/**
 * Shape of a geth genesis block. The chainId is strongly typed because it drives
 * the network id; all remaining standard genesis fields are permitted via the
 * index signatures so the object can be written verbatim to a genesis file.
 */
export interface GenesisBlock {
  config: {
    chainId: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Canonical CointMU genesis block, inlined so the application can initialize a
 * fresh chain without shipping or reading an external genesis.json file. This is
 * the single source of truth for the genesis state; the active chainId may be
 * overridden at runtime before initialization.
 */
export const GENESIS_BLOCK: GenesisBlock = {
  config: {
    chainId: COINTMU_NETWORK.chainId,
    homesteadBlock: 0,
    eip150Block: 0,
    eip155Block: 0,
    eip158Block: 0,
    byzantiumBlock: 0,
    constantinopleBlock: 0,
    petersburgBlock: 0,
    istanbulBlock: 0,
    muirGlacierBlock: 0,
    berlinBlock: 0,
    londonBlock: 0,
    ethash: {},
  },
  nonce: "0x0000000000000042",
  timestamp: "0x00",
  extraData: "0x485721206172696573206174204d7568616d6d61646979616820556e6976",
  gasLimit: "0x1C9C380",
  difficulty: "0x400000",
  mixHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  coinbase: "0x0000000000000000000000000000000000000000",
  number: "0x0",
  gasUsed: "0x0",
  parentHash:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  alloc: {
    "0x1e8207B59dd0888803f4d12466E0b2538C66766f": {
      balance: "1000000000000000000000000",
    },
  },
};
