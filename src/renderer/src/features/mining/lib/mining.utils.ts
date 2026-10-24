import i18next from "i18next";
import { DEFAULT_CONCURRENCY } from "../config/mining.constants";
import { type BlockData } from "@/shared/lib";

/**
 * Resolves a safe CPU core count from the browser environment, falling back to
 * a sensible default when the hardware concurrency hint is unavailable.
 * @returns The detected core count or the default concurrency.
 */
export function getSafeConcurrency(): number {
  try {
    return (
      (typeof navigator !== "undefined" && navigator.hardwareConcurrency) ||
      DEFAULT_CONCURRENCY
    );
  } catch {
    return DEFAULT_CONCURRENCY;
  }
}

/**
 * Builds a fixed-width window of share outcomes from the most recent blocks. Each
 * slot is true when the active wallet mined that block, false when another miner
 * did, and null when no block occupies the slot yet.
 * @param recentBlocks - The most recent blocks, oldest to newest.
 * @param windowSize - The number of slots in the share window.
 * @param activeWalletAddress - The address used to attribute self-mined blocks.
 * @returns An ordered array of share outcomes for rendering the share grid.
 */
export function computeSharesData(
  recentBlocks: BlockData[],
  windowSize: number,
  activeWalletAddress: string | null,
): Array<boolean | null> {
  return Array.from({ length: windowSize }).map((_, i) => {
    const blockIndex = windowSize - 1 - i;
    if (blockIndex < recentBlocks.length) {
      return (
        recentBlocks[blockIndex].miner.toLowerCase() ===
        activeWalletAddress?.toLowerCase()
      );
    }
    return null;
  });
}

/**
 * Formats a comma-grouped balance string into a localized rewards figure,
 * collapsing to a single decimal place for whole numbers.
 * @param balance - The comma-grouped balance string to format.
 * @returns The formatted rewards string, or '0.0' when the balance is invalid.
 */
export function formatRewards(balance: string): string {
  const parsed = parseFloat(balance.replace(/,/g, ""));
  if (isNaN(parsed)) {
    return "0.0";
  }
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: parsed % 1 === 0 ? 1 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Renders a network difficulty value as a hex label, falling back to a loading
 * placeholder until a positive difficulty is available.
 * @param difficulty - The numeric difficulty value.
 * @returns The hex-formatted difficulty label or a loading placeholder.
 */
export function formatDifficultyLabel(difficulty: number): string {
  return difficulty > 0
    ? "0x" + difficulty.toString(16)
    : i18next.t("mining:hero.difficultyLoading");
}
