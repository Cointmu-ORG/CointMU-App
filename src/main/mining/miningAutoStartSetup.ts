import { powerMonitor } from "electron";
import type { MiningAutoStartState } from "../../bridge/types";
import { readNodeStatus } from "../geth/rpc/nodeStatus";
import type { AppStore } from "../store/appStore";
import { MiningAutoStart, type AutoStartSettings } from "./miningAutoStart";

/** The key that replaced mining.startAtLaunch (see settingsMigration). */
export const AUTO_START_KEY = "mining.autoStartAtLaunch";
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/**
 * @param store - The settings store.
 * @returns The settings side of the auto-start conditions, read now.
 */
export function readAutoStartSettings(store: AppStore): AutoStartSettings {
  return {
    isOn: store.get(AUTO_START_KEY) === true,
    isMiningAllowed: store.get("mining.isMiningEnabled") === true,
    hasRewardAddress: ADDRESS_PATTERN.test(
      String(store.get("mining.poolAddress") ?? ""),
    ),
    isHeldByBattery:
      store.get("mining.pauseOnBattery") !== false &&
      powerMonitor.isOnBatteryPower(),
  };
}

/** What the auto-start needs from the mining controller. */
export interface AutoStartMiner {
  readonly isStarted: () => boolean;
  readonly start: () => Promise<void>;
  readonly publish: (state: MiningAutoStartState) => void;
}

/**
 * @param rpcPort - The node's RPC port.
 * @param store - The settings store.
 * @param miner - The controller's side.
 * @returns The auto-start; call begin() once the window exists.
 */
export function createMiningAutoStart(
  rpcPort: number,
  store: AppStore,
  miner: AutoStartMiner,
): MiningAutoStart {
  return new MiningAutoStart({
    readSettings: () => readAutoStartSettings(store),
    readNodeStatus: () => readNodeStatus(rpcPort),
    isMiningStarted: miner.isStarted,
    startMining: miner.start,
    publish: miner.publish,
    now: Date.now,
  });
}
