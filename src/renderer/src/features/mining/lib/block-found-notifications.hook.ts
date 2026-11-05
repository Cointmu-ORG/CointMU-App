import { useEffect, useRef } from "react";
import i18next from "i18next";
import { dispatchNotification } from "@/entities/notification";
import { call, getSetting } from "@/shared/api";
import { useAppStore } from "@/shared/model";

// A long gap (sleep, resync) is not worth a burst of old notifications.
export const MAX_BLOCKS_PER_CHECK = 16;
const HEX_RADIX = 16;

interface BlockHeader {
  readonly number: number;
  readonly hash: string;
  readonly miner: string;
}

/**
 * @param lastSeen - The head at the previous check, or null on the first.
 * @param head - The current head.
 * @returns The new block numbers to look at, oldest first; none on the first
 *   check (no notifications for blocks mined before the app was watching).
 */
export function newBlockNumbers(
  lastSeen: number | null,
  head: number,
): number[] {
  if (lastSeen === null || head <= lastSeen) return [];
  const from = Math.max(lastSeen + 1, head - MAX_BLOCKS_PER_CHECK + 1);
  return Array.from({ length: head - from + 1 }, (_, i) => from + i);
}

/**
 * @param blocks - New block headers.
 * @param ownAddresses - The reward address (coinbase) and the user's accounts.
 * @returns The blocks one of those addresses mined.
 */
export function ownBlocks(
  blocks: readonly BlockHeader[],
  ownAddresses: readonly string[],
): BlockHeader[] {
  const own = new Set(ownAddresses.map((address) => address.toLowerCase()));
  return blocks.filter((block) => own.has(block.miner.toLowerCase()));
}

async function readHeader(blockNumber: number): Promise<BlockHeader | null> {
  const block = await call("eth_getBlockByNumber", [
    `0x${blockNumber.toString(HEX_RADIX)}`,
    false,
  ]);
  if (!block || typeof block.miner !== "string") return null;
  return { number: blockNumber, hash: String(block.hash), miner: block.miner };
}

async function notifyOwnBlocks(
  blockNumbers: readonly number[],
  accounts: readonly string[],
): Promise<void> {
  const coinbase = await getSetting<string | null>("mining.poolAddress");
  const headers = await Promise.all(blockNumbers.map(readHeader));
  const found = ownBlocks(
    headers.filter((header): header is BlockHeader => header !== null),
    coinbase ? [coinbase, ...accounts] : accounts,
  );
  found.forEach((block) => {
    dispatchNotification(
      "mining",
      i18next.t("mining:notification.blockMinedTitle"),
      i18next.t("mining:notification.blockMinedMessage", {
        number: block.number,
      }),
      { hash: block.hash, number: block.number },
    );
  });
}

/**
 * Notifies when our coinbase (the reward address) or one of the user's
 * accounts mines a block, wherever the user is in the app. Follows the
 * notification settings through dispatchNotification.
 * @param accounts - The user's account addresses.
 */
export function useBlockFoundNotifications(accounts: readonly string[]): void {
  const head = useAppStore((s) => s.blockHeight);
  const lastSeen = useRef<number | null>(null);
  const accountsKey = accounts.join(",");

  useEffect(() => {
    if (head === null) return;
    const blockNumbers = newBlockNumbers(lastSeen.current, head);
    lastSeen.current = Math.max(head, lastSeen.current ?? head);
    if (blockNumbers.length === 0) return;
    const owned = accountsKey ? accountsKey.split(",") : [];
    notifyOwnBlocks(blockNumbers, owned).catch((err: unknown) => {
      console.error("Failed to check new blocks for our miner", err);
    });
  }, [head, accountsKey]);
}
