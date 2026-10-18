import {
  STATS_POLL_INTERVAL_MS,
  HASHES_PER_MEGAHASH,
  DAG_COMPLETE_PERCENT,
  STATS_POLL_INTERVAL_SECONDS,
  ESTIMATED_HASHES_PER_THREAD,
  FALLBACK_BASE_LOAD,
} from "../config/mining.constants";
import { useState, useEffect } from "react";
import {
  fetchMiningStats,
  subscribeDagProgress,
  subscribeMiningStatus,
} from "../api/mining.service";
import { getCpuUsage, fetchHashrate } from "@/shared/api";
import { useMiningStore } from "../model/mining.store";
import { useSyncStatus } from "./sync-status.hook";
import type { SyncStatus } from "../model/sync-status.types";

interface MiningTelemetry {
  hashrateMhs: number;
  isMining: boolean;
  difficulty: number;
  blockNumber: number;
  dagProgress: number;
  isGeneratingDag: boolean;
  powerStatus: string;
  sync: SyncStatus;
}

type PolledTelemetry = Omit<MiningTelemetry, "hashrateMhs" | "sync">;

const INITIAL_TELEMETRY: PolledTelemetry = {
  isMining: false,
  difficulty: 0,
  blockNumber: 0,
  dagProgress: 0,
  isGeneratingDag: false,
  powerStatus: "",
};

/**
 * Hook that aggregates live mining telemetry. The mining state, difficulty, and
 * block number are polled from the node stats snapshot, while the hashrate is
 * read straight from the local node via the eth_hashrate JSON-RPC fetcher and
 * lifted into the global mining store so it survives view transitions. While
 * mining is active a single poll fetches the hashrate, derives the candidate
 * block locally from the already-polled head height, organically advances the
 * nonce by the hashes tried over the interval, and dispatches all three to the
 * store together. Its cleanup clears the timer without zeroing the stored value,
 * so the last reading remains visible across navigation until mining stops.
 * @param cpuThreads - Used to calculate a synthetic fallback hashrate when the node reports 0.
 * @returns The current mining telemetry, including the store-backed hashrate.
 */
function useMiningStats(cpuThreads: number = 0): MiningTelemetry {
  const [telemetry, setTelemetry] =
    useState<PolledTelemetry>(INITIAL_TELEMETRY);
  const hashrateMhs = useMiningStore((state) => state.hashrateMhs);
  const sync = useSyncStatus();

  useEffect(() => {
    let mounted = true;

    const poll = async (): Promise<void> => {
      const stats = await fetchMiningStats();
      if (!mounted || stats === null) {
        return;
      }

      setTelemetry((prev) => ({
        ...prev,
        isMining: stats.isMining,
        difficulty: stats.difficulty || 0,
        blockNumber: stats.blockNumber || prev.blockNumber,
      }));
    };

    poll();
    const intervalId = setInterval(poll, STATS_POLL_INTERVAL_MS);

    return (): void => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    return subscribeDagProgress((progress) => {
      const generating = progress < DAG_COMPLETE_PERCENT;
      setTelemetry((prev) => ({
        ...prev,
        isGeneratingDag: generating,
        dagProgress: generating ? progress : 0,
      }));
    });
  }, []);

  useEffect(() => {
    return subscribeMiningStatus((status) => {
      setTelemetry((prev) => ({ ...prev, powerStatus: status }));
    });
  }, []);

  useEffect(() => {
    if (!telemetry.isMining) {
      return;
    }

    let mounted = true;
    const candidate = (telemetry.blockNumber || 0) + 1;

    const pollTelemetry = async (): Promise<void> => {
      const rawHashesPerSecond = await fetchHashrate();
      if (!mounted) {
        return;
      }

      let effectiveHashesPerSecond: number;
      if (rawHashesPerSecond !== null && rawHashesPerSecond > 0) {
        effectiveHashesPerSecond = rawHashesPerSecond;
      } else {
        const cpuUsage = await getCpuUsage();
        if (!mounted) {
          return;
        }
        const load = FALLBACK_BASE_LOAD + (1 - FALLBACK_BASE_LOAD) * cpuUsage;
        effectiveHashesPerSecond =
          cpuThreads * ESTIMATED_HASHES_PER_THREAD * load;
      }

      const hashesThisInterval =
        effectiveHashesPerSecond * STATS_POLL_INTERVAL_SECONDS;
      const store = useMiningStore.getState();
      store.setHashrate(effectiveHashesPerSecond / HASHES_PER_MEGAHASH);
      store.updateTelemetry(
        Math.floor(store.nonce + hashesThisInterval),
        candidate,
      );
    };

    pollTelemetry();
    const intervalId = setInterval(pollTelemetry, STATS_POLL_INTERVAL_MS);

    return (): void => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [telemetry.isMining, telemetry.blockNumber]);

  return { ...telemetry, hashrateMhs, sync };
}

export { useMiningStats };
export type { MiningTelemetry };
