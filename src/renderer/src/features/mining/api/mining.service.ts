import { getAllSettings, setSetting } from "@/shared/api";
import { type MiningLog } from "../model/mining.store";

interface MiningStats {
  isMining: boolean;
  hashrate: number;
  difficulty: number;
  blockNumber: number;
}

interface MiningConfig {
  isMiningEnabled: boolean;
  cpuThreads: number;
  intensity: string;
  poolAddress: string;
}

type Unsubscribe = () => void;

const SETTINGS_KEY_MINING_ENABLED = "mining.isMiningEnabled";
const DEFAULT_CPU_THREADS = 4;
const DEFAULT_INTENSITY = "Balanced";

/**
 * Reads the persisted mining configuration from the main process store and
 * normalizes missing fields to safe defaults.
 * @returns The current mining configuration.
 */
async function getMiningConfig(): Promise<MiningConfig> {
  const all = await getAllSettings();
  const config = (all?.mining ?? {}) as Partial<MiningConfig>;
  return {
    isMiningEnabled: config.isMiningEnabled === true,
    cpuThreads:
      typeof config.cpuThreads === "number"
        ? config.cpuThreads
        : DEFAULT_CPU_THREADS,
    intensity:
      typeof config.intensity === "string"
        ? config.intensity
        : DEFAULT_INTENSITY,
    poolAddress:
      typeof config.poolAddress === "string" ? config.poolAddress : "",
  };
}

/**
 * Enables or disables mining by persisting the global flag and toggling the
 * underlying node miner process through the main process controller.
 * @param enabled - The desired mining state.
 * @returns A promise resolving once both operations complete.
 */
async function setMiningEnabled(enabled: boolean): Promise<void> {
  await setSetting(SETTINGS_KEY_MINING_ENABLED, enabled);
  await window.api.mining.toggle(enabled);
}

/**
 * Toggles the node miner process without modifying the persisted enabled flag.
 * Used when the caller manages the flag separately.
 * @param enabled - The desired miner state.
 * @returns A promise resolving once the toggle is dispatched.
 */
async function toggleMiner(enabled: boolean): Promise<void> {
  return window.api.mining.toggle(enabled);
}

/**
 * Updates the number of CPU threads allocated to the node miner.
 * @param cores - The thread count to apply.
 * @returns A promise resolving once the change is dispatched.
 */
async function setThreads(cores: number): Promise<void> {
  return window.api.mining.setThreads(cores);
}

/**
 * Updates the reward (etherbase) address used by the node miner.
 * @param address - The wallet address to credit block rewards to.
 * @returns A promise resolving once the change is dispatched.
 */
async function setPoolAddress(address: string): Promise<void> {
  return window.api.mining.setPoolAddress(address);
}

/**
 * Fetches a snapshot of live mining telemetry from the node via IPC.
 * @returns The current mining stats, or null when the bridge is unavailable.
 */
async function fetchMiningStats(): Promise<MiningStats | null> {
  try {
    return await window.api.mining.getStats();
  } catch {
    return null;
  }
}

/**
 * Subscribes to mining status change notifications pushed from the main process.
 * @param callback - Invoked with the latest human-readable status string.
 * @returns An unsubscribe function that detaches the listener.
 */
function subscribeMiningStatus(
  callback: (status: string) => void,
): Unsubscribe {
  return window.api.mining.onMiningStatusChanged(callback);
}

/**
 * Subscribes to DAG generation progress notifications from the main process.
 * @param callback - Invoked with the latest progress percentage.
 * @returns An unsubscribe function that detaches the listener.
 */
function subscribeDagProgress(
  callback: (progress: number) => void,
): Unsubscribe {
  return window.api.mining.onDagProgress(callback);
}

/**
 * Subscribes to parsed Geth mining log events pushed from the main process.
 * @param callback - Invoked with each normalized mining log entry.
 * @returns An unsubscribe function that detaches the listener.
 */
function subscribeMiningLog(callback: (log: MiningLog) => void): Unsubscribe {
  return window.api.mining.onMiningLog(callback);
}

export {
  getMiningConfig,
  setMiningEnabled,
  toggleMiner,
  setThreads,
  setPoolAddress,
  fetchMiningStats,
  subscribeMiningStatus,
  subscribeDagProgress,
  subscribeMiningLog,
};
export type { MiningStats, MiningConfig };
