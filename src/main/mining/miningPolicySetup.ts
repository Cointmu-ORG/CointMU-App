import { powerMonitor } from "electron";
import { MiningPowerStatus } from "../../bridge/types";
import { callGethRpc } from "../geth/rpc/rpcUtils";
import type { AppStore } from "../store/appStore";
import type { MiningConditions } from "./miningPolicy";
import { MiningPolicy } from "./miningPolicyRunner";

const DEFAULT_THREADS = 4;
const DEFAULT_IDLE_MINUTES = 2;
const SECONDS_PER_MINUTE = 60;

/**
 * @param store - The settings store.
 * @param isStarted - The user started mining this session (Mining page or
 *   tray); the stored mining.isMiningEnabled is only the permission.
 * @returns The conditions the policy decides on, read now.
 */
function readConditions(
  store: AppStore,
  isStarted: () => boolean,
): MiningConditions {
  const isEnabled = isStarted() && store.get("mining.isMiningEnabled") === true;
  const idleOnly = store.get("mining.idleOnly") === true;
  const idleMinutes =
    Number(store.get("mining.idleThresholdMinutes")) || DEFAULT_IDLE_MINUTES;
  return {
    isEnabled,
    isOnBattery: powerMonitor.isOnBatteryPower(),
    pauseOnBattery: store.get("mining.pauseOnBattery") !== false,
    idleOnly,
    // Asked of the OS only while it matters.
    idleSeconds: isEnabled && idleOnly ? powerMonitor.getSystemIdleTime() : 0,
    idleThresholdSeconds: idleMinutes * SECONDS_PER_MINUTE,
  };
}

/**
 * Builds the mining policy for the running node and re-evaluates it on
 * power changes and on any change of the mining settings.
 * @param rpcPort - The node's RPC port.
 * @param store - The settings store.
 * @param isStarted - Whether the user started mining this session.
 * @param publish - Sends the decision to the UI.
 * @returns The policy.
 */
export function createMiningPolicy(
  rpcPort: number,
  store: AppStore,
  isStarted: () => boolean,
  publish: (status: MiningPowerStatus) => void,
): MiningPolicy {
  const policy = new MiningPolicy({
    readConditions: () => readConditions(store, isStarted),
    isMinerRunning: async () =>
      (await callGethRpc(rpcPort, "eth_mining")) === true,
    startMiner: async () => {
      const threads = Number(store.get("mining.cpuThreads")) || DEFAULT_THREADS;
      await callGethRpc(rpcPort, "miner_setEtherbase", [
        store.get("mining.poolAddress"),
      ]);
      await callGethRpc(rpcPort, "miner_start", [Math.floor(threads)]);
    },
    stopMiner: async () => {
      await callGethRpc(rpcPort, "miner_stop");
    },
    publish,
  });
  const evaluate = (): void => void policy.evaluate();
  powerMonitor.on("on-battery", evaluate);
  powerMonitor.on("on-ac", evaluate);
  store.onDidChange("mining", evaluate);
  return policy;
}
