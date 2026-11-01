import { useState, useEffect } from "react";
import { call } from "@/shared/api";

export interface BlockData {
  number: number;
  hash: string;
  miner: string;
  timestamp: number;
  txCount: number;
  transactions?: any[];
}

/**
 * Hook that fetches the last 10 blocks when the current block number changes.
 * Used across multiple features (Dashboard, Explorer, Mining) to display recent chain activity.
 * @param blockNumber - The current highest block number.
 * @param isConnected - Whether the RPC node is reachable.
 * @returns An array of BlockData objects for the most recent blocks.
 */
export function useRecentBlocks(
  blockNumber: number | null,
  isConnected: boolean,
): BlockData[] {
  const [recentBlocks, setRecentBlocks] = useState<BlockData[]>([]);

  useEffect(() => {
    if (!isConnected || blockNumber === null) {
      if (!isConnected) setRecentBlocks([]);
      return;
    }

    // Prevents state updates if the component unmounts before fetch completes
    let isMounted = true;

    // Capture non-null value for the async closure
    const currentBlock = blockNumber;

    async function fetchBlocks(): Promise<void> {
      try {
        // Fetch up to the last 10 blocks
        const start = currentBlock;
        const end = Math.max(0, currentBlock - 9);
        const promises: Promise<any>[] = [];

        for (let i = start; i >= end; i--) {
          promises.push(
            call("eth_getBlockByNumber", ["0x" + i.toString(16), true]),
          );
        }

        const responses = await Promise.all(promises);

        if (!isMounted) return;

        const blocks: BlockData[] = responses
          .filter((res) => res !== null)
          .map((res) => ({
            number: parseInt(res.number, 16),
            hash: res.hash,
            miner: res.miner,
            timestamp: parseInt(res.timestamp, 16),
            txCount: Array.isArray(res.transactions)
              ? res.transactions.length
              : 0,
            transactions: res.transactions || [],
          }));

        setRecentBlocks(blocks);
      } catch {
        // Silently ignore errors during polling
      }
    }

    fetchBlocks();

    return (): void => {
      isMounted = false;
    };
  }, [blockNumber, isConnected]);

  return recentBlocks;
}
