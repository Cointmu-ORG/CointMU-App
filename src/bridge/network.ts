/**
 * The only network the desktop app runs. Moving to another node is done with
 * the bootnode setting, not by switching networks; developers and CI override
 * the network id with the GETH_NETWORK_ID environment variable.
 */
export const COINTMU_NETWORK = {
  name: "CointMU Mainnet",
  chainId: 1912,
} as const;
