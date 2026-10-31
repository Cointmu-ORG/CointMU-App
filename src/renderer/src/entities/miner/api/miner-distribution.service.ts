import type { MinerRange } from "@bridge/types";
import {
  toMinerDistribution,
  type MinerDistribution,
} from "../lib/miner-distribution.util";

const lastByRange = new Map<MinerRange, MinerDistribution>();

/**
 * @param range - The time window.
 * @returns The last distribution fetched for that range, so a remount shows it at once.
 */
export function getCachedMinerDistribution(
  range: MinerRange,
): MinerDistribution | undefined {
  return lastByRange.get(range);
}

/**
 * Fetches the miner distribution of a range from the main-process block index.
 * When the index cannot answer it returns the last known distribution instead
 * of an empty one, so a failed read never blanks the card.
 * @param range - The time window.
 * @returns The distribution, or null when none was ever available.
 */
export async function fetchMinerDistribution(
  range: MinerRange,
): Promise<MinerDistribution | null> {
  const result = await window.api.explorer.getMinerDistribution(range);
  if (result === null) return lastByRange.get(range) ?? null;
  const distribution = toMinerDistribution(result);
  lastByRange.set(range, distribution);
  return distribution;
}
