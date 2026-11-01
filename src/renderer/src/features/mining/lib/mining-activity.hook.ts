import { dispatchNotification } from "@/entities/notification";
import {
  MAX_LOG_ENTRIES,
  LOG_TIME_FORMAT,
  BLOCK_REWARD_LABEL,
} from "../config/mining.constants";
import { useState, useEffect, useRef } from "react";
import i18next from "i18next";
import { format } from "date-fns";
import { useMiningStore } from "../model/mining.store";
import { type BlockData } from "@/entities/block";

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
  color: string;
}

interface MiningActivity {
  logs: LogEntry[];
}

/**
 * Builds log entries for any blocks newer than the last processed height,
 * attributing self-mined blocks to any of the owned wallets.
 * @param blocks - The candidate blocks to convert into log entries.
 * @param owned - The set of lowercased owned addresses used to flag self-mined blocks.
 * @returns The derived log entries, newest first.
 */
function buildLogEntries(blocks: BlockData[], owned: Set<string>): LogEntry[] {
  return blocks.map((block, index) => {
    const timestamp = format(new Date(), LOG_TIME_FORMAT);
    const isMine = owned.has(block.miner.toLowerCase());
    return {
      id: `${block.hash}-${Date.now()}-${index}`,
      timestamp,
      level: isMine ? "OK" : "INFO",
      message: isMine
        ? i18next.t("mining:activity.logSealed", {
            number: block.number,
            reward: BLOCK_REWARD_LABEL,
          })
        : i18next.t("mining:activity.logSynced", {
            number: block.number,
            count: block.txCount,
          }),
      color: isMine ? "text-emerald-500" : "text-blue-400",
    };
  });
}

/**
 * Hook that derives the mining activity feed from live chain data. New blocks
 * are folded into a capped log, and any block mined by one of the owned wallets
 * is recorded to the global store so found-block history aggregates across all
 * wallets and can be filtered at display time.
 * @param recentBlocks - The most recent blocks observed on the network.
 * @param ownedAddresses - Every wallet address owned by the user.
 * @returns The capped log entries.
 */
function useMiningActivity(
  recentBlocks: BlockData[],
  ownedAddresses: string[],
): MiningActivity {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const lastProcessedBlock = useRef<number | null>(null);
  const recordFoundBlocks = useMiningStore((state) => state.recordFoundBlocks);
  const ownedKey = ownedAddresses.join(",");

  useEffect(() => {
    if (recentBlocks.length === 0) {
      return;
    }

    const owned = new Set(
      ownedKey.length > 0
        ? ownedKey.split(",").map((addr) => addr.toLowerCase())
        : [],
    );

    const newBlocks =
      lastProcessedBlock.current === null
        ? [recentBlocks[0]]
        : recentBlocks.filter(
            (block) => block.number > lastProcessedBlock.current!,
          );

    if (newBlocks.length === 0) {
      return;
    }

    lastProcessedBlock.current = Math.max(
      ...newBlocks.map((block) => block.number),
    );
    const entries = buildLogEntries(newBlocks, owned);
    setLogs((prev) => [...entries, ...prev].slice(0, MAX_LOG_ENTRIES));

    const selfMined = newBlocks.filter((block) =>
      owned.has(block.miner.toLowerCase()),
    );
    if (selfMined.length > 0) {
      recordFoundBlocks(
        selfMined.map((block) => ({
          number: block.number,
          hash: block.hash,
          miner: block.miner,
          timestamp: block.timestamp,
        })),
      );
      selfMined.forEach((block) => {
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
  }, [recentBlocks, ownedKey, recordFoundBlocks]);

  return { logs };
}

export { useMiningActivity };
export type { LogEntry, MiningActivity };
