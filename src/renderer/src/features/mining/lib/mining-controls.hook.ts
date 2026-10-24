import i18next from "i18next";
import { CONFIG_SYNC_INTERVAL_MS } from "../config/mining.constants";
import { useState, useEffect, useCallback } from "react";
import {
  getMiningConfig,
  setMiningEnabled,
  type MiningConfig,
} from "../api/mining.service";

interface MiningControls {
  config: MiningConfig;
  toggling: boolean;
  error: string | null;
  toggle: (enabled: boolean) => Promise<void>;
}

const INITIAL_CONFIG: MiningConfig = {
  isMiningEnabled: false,
  cpuThreads: 4,
  intensity: "Balanced",
  poolAddress: "",
};

/**
 * Hook that owns mining control state. It keeps a live mirror of the persisted
 * mining configuration and exposes a guarded toggle action that drives the node
 * miner through the mining service, tracking the in-flight and error states.
 * @returns The current config, toggling flag, last error, and toggle action.
 */
function useMiningControls(): MiningControls {
  const [config, setConfig] = useState<MiningConfig>(INITIAL_CONFIG);
  const [toggling, setToggling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const sync = async (): Promise<void> => {
      try {
        const next = await getMiningConfig();
        if (mounted) {
          setConfig(next);
        }
      } catch {
        return;
      }
    };

    sync();
    const intervalId = setInterval(sync, CONFIG_SYNC_INTERVAL_MS);

    return (): void => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const toggle = useCallback(async (enabled: boolean): Promise<void> => {
    setToggling(true);
    setError(null);
    try {
      await setMiningEnabled(enabled);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : i18next.t("mining:controls.toggleFailed"),
      );
    } finally {
      setToggling(false);
    }
  }, []);

  return { config, toggling, error, toggle };
}

export { useMiningControls };
export type { MiningControls };
