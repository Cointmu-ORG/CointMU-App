import { type ActivityData } from "@/shared/ui";
import { call } from "@/shared/api";
import { format } from "date-fns";

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

/**
 * Fetches a global stream of all transactions directly from the local node by pulling
 * the full block objects over the most recent window. This acts as a mini-indexer
 * for the Explorer to view network-wide activity regardless of wallet ownership.
 * @param currentBlockHeight - The highest known block number.
 * @param count - The number of trailing blocks to scan.
 * @returns A promise resolving to the combined, timestamp-sorted global activities.
 */
export async function getGlobalTransactions(
  currentBlockHeight: number,
  count: number = 12,
): Promise<ActivityData[]> {
  if (currentBlockHeight == null || currentBlockHeight < 0) return [];

  const promises: Promise<any>[] = [];
  const start = currentBlockHeight;
  const end = Math.max(0, currentBlockHeight - count + 1);

  for (let i = start; i >= end; i--) {
    promises.push(call("eth_getBlockByNumber", ["0x" + i.toString(16), true]));
  }

  try {
    const blocks = await Promise.all(promises);
    const txs: ActivityData[] = [];

    for (const block of blocks) {
      if (!block || !block.transactions) continue;
      const timestamp = parseInt(block.timestamp, 16);

      for (const tx of block.transactions) {
        if (!tx || typeof tx !== "object") continue;
        const amountCmu = (parseInt(tx.value, 16) / 1e18).toFixed(4);

        txs.push({
          id: tx.hash,
          type: tx.to ? "send" : "contract",
          title: tx.to ? "Transaction" : "Contract Creation",
          subtitle: "",
          amount: amountCmu,
          timestamp: timestamp,
          timestampStr: format(timestamp * 1000, "MMM d, yyyy, h:mm a"),
          blockNumber: parseInt(tx.blockNumber, 16),
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
        });
      }
    }

    return txs.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.error("Failed to get global transactions from RPC:", err);
    return [];
  }
}
