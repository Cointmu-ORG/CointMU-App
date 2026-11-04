/**
 * The only network the desktop app runs. Moving to another node is done with
 * the bootnode setting, not by switching networks; developers and CI override
 * the network id with the GETH_NETWORK_ID environment variable.
 */
export const COINTMU_NETWORK = {
  name: "CointMU Mainnet",
  chainId: 1912,
} as const;

/** P2P listen ports the user may pick: unprivileged, so geth needs no root. */
export const LISTEN_PORT_RANGE = { min: 1024, max: 65535 } as const;

/**
 * @param value - A stored or entered listen port.
 * @returns True for a whole number inside LISTEN_PORT_RANGE.
 */
export function isListenPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= LISTEN_PORT_RANGE.min &&
    value <= LISTEN_PORT_RANGE.max
  );
}
