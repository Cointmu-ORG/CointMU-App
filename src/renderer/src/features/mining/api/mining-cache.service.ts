import { type FoundBlock } from "../model/mining.store";

let foundBlocksCache: FoundBlock[] | undefined;

let foundBlocksPollingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * A module-scoped in-memory cache service for mining statistics.
 * Provides stale-while-revalidate semantics with background polling.
 */
export const MiningCacheService = {
  /**
   * Retrieves the cached found blocks list.
   * @returns The cached array of FoundBlock, or undefined if not yet populated.
   */
  getFoundBlocks: (): FoundBlock[] | undefined => {
    return foundBlocksCache;
  },

  /**
   * Caches the found blocks list globally.
   * @param data - The array of FoundBlock to cache.
   * @returns void
   */
  setFoundBlocks: (data: FoundBlock[]): void => {
    foundBlocksCache = data;
  },

  /**
   * Starts a single global background polling interval to refresh the found
   * blocks dataset from the node.
   * @param fetcher - An async function that fetches and returns the latest found blocks.
   * @param onData - A callback invoked with fresh data after each successful fetch.
   * @param intervalMs - The polling cadence in milliseconds.
   * @returns void
   */
  startFoundBlocksPolling: (
    fetcher: () => Promise<FoundBlock[]>,
    onData: (data: FoundBlock[]) => void,
    intervalMs: number,
  ): void => {
    if (foundBlocksPollingInterval !== null) return;
    const tick = async (): Promise<void> => {
      try {
        const data = await fetcher();
        MiningCacheService.setFoundBlocks(data);
        onData(data);
      } catch {
        // Silently ignore polling errors
      }
    };
    void tick();
    foundBlocksPollingInterval = setInterval(() => {
      void tick();
    }, intervalMs);
  },

  /**
   * Stops the global found blocks polling interval.
   * @returns void
   */
  stopFoundBlocksPolling: (): void => {
    if (foundBlocksPollingInterval !== null) {
      clearInterval(foundBlocksPollingInterval);
      foundBlocksPollingInterval = null;
    }
  },
};
