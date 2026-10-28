import { type MinerEntry } from "../lib/miner-distribution.util";

let minerDistributionCache: MinerEntry[] | undefined;
let minerDistributionPollingInterval: ReturnType<typeof setInterval> | null =
  null;

/**
 * A module-scoped in-memory cache for the miner distribution, with
 * stale-while-revalidate semantics and one shared background poll.
 */
export const MinerDistributionCache = {
  /**
   * Retrieves the cached miner distribution data.
   * @returns The cached array of MinerEntry, or undefined if not cached.
   */
  getMinerDistribution: (): MinerEntry[] | undefined => {
    return minerDistributionCache;
  },

  /**
   * Caches the miner distribution data globally.
   * @param data - The array of MinerEntry to cache.
   * @returns void
   */
  setMinerDistribution: (data: MinerEntry[]): void => {
    minerDistributionCache = data;
  },

  /**
   * Starts a single global background polling interval for the miner
   * distribution dataset.
   * @param fetcher - An async function that fetches and returns the latest miner entries.
   * @param onData - A callback invoked with fresh data after each fetch.
   * @param intervalMs - The polling cadence in milliseconds.
   * @returns void
   */
  startMinerDistributionPolling: (
    fetcher: () => Promise<MinerEntry[]>,
    onData: (data: MinerEntry[]) => void,
    intervalMs: number,
  ): void => {
    if (minerDistributionPollingInterval !== null) return;
    const tick = async (): Promise<void> => {
      try {
        const data = await fetcher();
        MinerDistributionCache.setMinerDistribution(data);
        onData(data);
      } catch {
        // Silently ignore polling errors
      }
    };
    void tick();
    minerDistributionPollingInterval = setInterval(() => {
      void tick();
    }, intervalMs);
  },

  /**
   * Stops the global miner distribution polling interval.
   * @returns void
   */
  stopMinerDistributionPolling: (): void => {
    if (minerDistributionPollingInterval !== null) {
      clearInterval(minerDistributionPollingInterval);
      minerDistributionPollingInterval = null;
    }
  },
};
