import { type ActivityData } from "@/shared/ui";

/**
 * Retrieves the aggregated local transaction history across the supplied wallet
 * addresses. The main process scans the chain once and matches every address in
 * a single pass, returning records already sorted by timestamp descending.
 * Currently sources data from a Geth block scan over a recent window.
 * @param addresses - The wallet addresses to aggregate history across.
 * @returns A promise resolving to the combined, timestamp-sorted activities.
 */
export async function getTransactions(
  addresses: string[],
): Promise<ActivityData[]> {
  if (!addresses || addresses.length === 0) return [];
  try {
    const activities = await window.api.wallet.getActivity(addresses);
    return activities.slice(0, 50);
  } catch (error) {
    console.error("Failed to get transactions from IPC:", error);
    return [];
  }
}
