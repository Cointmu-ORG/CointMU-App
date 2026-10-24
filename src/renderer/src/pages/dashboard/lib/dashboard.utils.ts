import { CMU_PER_MINED_BLOCK } from "../config/dashboard.constants";

/**
 * Derives the approximate number of self-mined blocks implied by a balance,
 * assuming a fixed reward per mined block.
 * @param balance - The comma-grouped balance string.
 * @returns The estimated mined block count, or 0 when the balance is invalid.
 */
export function computeMinedBlocksCount(balance: string): number {
  const parsed = parseFloat(balance.replace(/,/g, ""));
  return isNaN(parsed) ? 0 : Math.floor(parsed / CMU_PER_MINED_BLOCK);
}
