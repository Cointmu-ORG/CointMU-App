export const ExternalMinerStatus = {
  /** The setting is off: the built-in CPU miner is in use. */
  OFF: "off",
  /** Mining is not started, so the node hands out no work. */
  IDLE: "idle",
  /** Work is handed out, but no miner reports a hashrate. */
  WAITING: "waiting",
  /** An external miner reports a hashrate (eth_submitHashrate). */
  REPORTING: "reporting",
} as const;

export type ExternalMinerStatus =
  (typeof ExternalMinerStatus)[keyof typeof ExternalMinerStatus];

interface NodeMiningStats {
  isMining: boolean;
  hashrate: number;
}

/**
 * Decides what Settings → Other connections shows for the external miner.
 * geth reports one hashrate (CPU + submitted); with the external miner on,
 * CPU sealing is off, so that number is the external miner's alone.
 * @param isExternalMiner - The stored mining.externalMiner value.
 * @param stats - The node's mining stats, or null when it does not answer.
 * @returns The status to show.
 */
export function resolveExternalMinerStatus(
  isExternalMiner: boolean,
  stats: NodeMiningStats | null,
): ExternalMinerStatus {
  if (!isExternalMiner) return ExternalMinerStatus.OFF;
  if (!stats?.isMining) return ExternalMinerStatus.IDLE;
  return stats.hashrate > 0
    ? ExternalMinerStatus.REPORTING
    : ExternalMinerStatus.WAITING;
}
