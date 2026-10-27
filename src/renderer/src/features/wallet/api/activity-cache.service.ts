import type { WalletActivity } from "@bridge/types";

const activityCache = new Map<string, WalletActivity[]>();
const activityPollingIntervals = new Map<
  string,
  ReturnType<typeof setInterval>
>();

/**
 * A module-scoped in-memory cache service for activity data.
 */
export const ActivityCacheService = {
  /**
   * Retrieves the cached activity list for a given wallet address.
   * @param address - The wallet address used as the cache key.
   * @returns The cached array of WalletActivity, or undefined if not cached.
   */
  getActivity: (address: string): WalletActivity[] | undefined => {
    return activityCache.get(address);
  },

  /**
   * Caches the activity list for a given wallet address.
   * @param address - The wallet address used as the cache key.
   * @param data - The array of WalletActivity to cache.
   * @returns void
   */
  setActivity: (address: string, data: WalletActivity[]): void => {
    activityCache.set(address, data);
  },

  /**
   * Starts a background polling interval for the activity of a specific
   * wallet address.
   * @param address - The wallet address to poll activity for.
   * @param fetcher - An async function that fetches and returns the latest activity.
   * @param onData - A callback invoked with fresh data after each fetch.
   * @param intervalMs - The polling cadence in milliseconds.
   * @returns void
   */
  startActivityPolling: (
    address: string,
    fetcher: () => Promise<WalletActivity[]>,
    onData: (data: WalletActivity[]) => void,
    intervalMs: number,
  ): void => {
    if (activityPollingIntervals.has(address)) return;
    const tick = async (): Promise<void> => {
      try {
        const data = await fetcher();
        ActivityCacheService.setActivity(address, data);
        onData(data);
      } catch {
        // Silently ignore polling errors
      }
    };
    void tick();
    const id = setInterval(() => {
      void tick();
    }, intervalMs);
    activityPollingIntervals.set(address, id);
  },

  /**
   * Stops the background activity polling interval for a given wallet address.
   * @param address - The wallet address whose polling interval should be cleared.
   * @returns void
   */
  stopActivityPolling: (address: string): void => {
    const id = activityPollingIntervals.get(address);
    if (id !== undefined) {
      clearInterval(id);
      activityPollingIntervals.delete(address);
    }
  },
};
