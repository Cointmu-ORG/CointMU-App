const DEFAULT_THREADS = 4;
// miner_start(0): geth keeps handing out work (eth_getWork) but turns its own
// CPU sealing off, which is what an external getWork miner needs.
const EXTERNAL_MINER_THREADS = 0;

/**
 * Picks the thread count for miner_start.
 * @param isExternalMiner - The stored mining.externalMiner value.
 * @param cpuThreads - The stored mining.cpuThreads value.
 * @returns 0 (no CPU sealing) for an external miner, otherwise the stored
 *   whole thread count, or the default when it is not a positive number.
 */
export function resolveMinerThreads(
  isExternalMiner: unknown,
  cpuThreads: unknown,
): number {
  if (isExternalMiner === true) return EXTERNAL_MINER_THREADS;
  return Math.floor(Number(cpuThreads)) || DEFAULT_THREADS;
}
