import { useEffect, useState } from "react";
import type { MinerRange } from "@bridge/types";
import {
  fetchMinerDistribution,
  getCachedMinerDistribution,
  type MinerDistribution,
} from "@/entities/miner";
import { MINER_POLL_INTERVAL_MS } from "../config/explorer.constants";

interface MinerDistributionState {
  distribution: MinerDistribution | null;
  isLoading: boolean;
}

interface RangeState extends MinerDistributionState {
  range: MinerRange;
}

/**
 * Polls the miner distribution of a range from the local block index. The
 * index answers while the node is down, so polling does not depend on the
 * node connection. Shows the cached result of the range at once, and drops
 * answers that arrive after the range changed.
 * @param range - The selected time window.
 * @returns The latest distribution (null when none is available) and whether the first load is pending.
 */
export function useMinerDistribution(
  range: MinerRange,
): MinerDistributionState {
  const [state, setState] = useState<RangeState>(() => ({
    range,
    ...fromCache(range),
  }));

  useEffect(() => {
    let isCurrent = true;
    const load = async (): Promise<void> => {
      try {
        const distribution = await fetchMinerDistribution(range);
        if (isCurrent) setState({ range, distribution, isLoading: false });
      } catch (err) {
        console.error("[explorer] Failed to load the miner distribution", err);
        if (isCurrent) {
          setState({ range, ...fromCache(range), isLoading: false });
        }
      }
    };
    void load();
    const timer = setInterval(() => void load(), MINER_POLL_INTERVAL_MS);
    return () => {
      isCurrent = false;
      clearInterval(timer);
    };
  }, [range]);

  // Until the first answer for a newly selected range, show its cached data.
  return state.range === range ? state : fromCache(range);
}

function fromCache(range: MinerRange): MinerDistributionState {
  const cached = getCachedMinerDistribution(range);
  return { distribution: cached ?? null, isLoading: cached === undefined };
}
