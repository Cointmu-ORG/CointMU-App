import { MINING_DEBOUNCE_DELAY_MS, MAX_CORES } from "@/features/settings";
import { useState, useEffect, useRef, type JSX } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsStore } from "@/features/settings";
import { setSetting } from "@/shared/api";
import { toggleMiner, setThreads, setPoolAddress } from "@/features/mining";
import { CustomDropdown } from "@/shared/ui";
import { INTENSITY_LABEL_KEYS } from "@/shared/lib";
import { MiningIntensity } from "@bridge/setting-values";

interface MiningSettingsProps {
  config: SettingsStore["mining"];
  accounts?: { address: string; label: string }[];
  onUpdate: (key: string, value: any) => void;
}

/**
 * Mining settings pane configuring internal node worker threads, intensity,
 * battery behavior, pool vs solo mode, and payout addresses. Actively controls
 * the underlying Geth node via IPC bridge when settings are changed.
 * @param {MiningSettingsProps} props - The configuration state and the update callback.
 * @returns {JSX.Element} The Mining Settings form component.
 */
export function MiningSettings({
  config,
  accounts = [],
  onUpdate,
}: MiningSettingsProps): JSX.Element {
  const { t } = useTranslation();
  const [rewardInput, setRewardInput] = useState<string>(
    config.poolAddress || "",
  );

  const isAddressInAccounts = (address: string) =>
    accounts.some((acc) => acc.address === address);
  const [selectionMode, setSelectionMode] = useState<"local" | "custom">(() => {
    return isAddressInAccounts(config.poolAddress) || !config.poolAddress
      ? "local"
      : "custom";
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRewardInput(config.poolAddress || "");
    if (isAddressInAccounts(config.poolAddress) || !config.poolAddress) {
      setSelectionMode("local");
    } else {
      setSelectionMode("custom");
    }
  }, [config.poolAddress, accounts]);

  useEffect(() => {
    const ensureRewardAddress = async (): Promise<void> => {
      const hasValidReward =
        !!config.poolAddress && config.poolAddress.length === 42;
      if (!hasValidReward && accounts.length > 0) {
        onUpdate("poolAddress", accounts[0].address);
        await setPoolAddress(accounts[0].address);
      }
    };
    ensureRewardAddress();
  }, [accounts, config.poolAddress]);

  /**
   * Handles the Enable Mining permission switch. This switch only persists the
   * mining intent and never starts the node by itself, so it can never auto-start
   * mining when the Settings pane mounts. The Mining view remains the sole control
   * that starts the miner. Disabling the permission stops a running node as a
   * safety measure. The reward address is intentionally untouched here; it is
   * owned exclusively by the reward-address selector below.
   * @param {boolean} isEnabled - The new value of the mining permission.
   * @returns {Promise<void>}
   */
  const handleToggleMining = async (isEnabled: boolean): Promise<void> => {
    onUpdate("isMiningEnabled", isEnabled);
    await setSetting("mining.isMiningEnabled", isEnabled);

    if (isEnabled) {
      return;
    }

    try {
      await toggleMiner(false);
    } catch (err) {
      console.error("Failed to stop miner", err);
    }
  };

  /**
   * Handles the CPU thread slider value change.
   * @param {number} newCores - The newly selected core count.
   * @returns {Promise<void>}
   */
  const handleThreadChange = async (newCores: number): Promise<void> => {
    onUpdate("cpuThreads", newCores);
    await setSetting("mining.cpuThreads", newCores);

    try {
      await setThreads(newCores);
    } catch (err) {
      console.error("Failed to update threads", err);
    }
  };

  /**
   * Debounces the pool address input and dispatches the miner_setEtherbase
   * RPC call after the user stops typing. Reverts on failure.
   * @param {string} value - The raw input value from the address field.
   * @returns {void}
   */
  const handlePoolAddressChange = (value: string): void => {
    setRewardInput(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(async () => {
      const previous = config.poolAddress;
      onUpdate("poolAddress", value);
      if (value.startsWith("0x") && value.length === 42) {
        try {
          await setPoolAddress(value);
        } catch (err) {
          console.error("Failed to set pool address", err);
          onUpdate("poolAddress", previous);
        }
      }
    }, MINING_DEBOUNCE_DELAY_MS);
  };

  /**
   * Handles selection from the local wallets dropdown.
   * @param {string} value - The selected address or 'custom'.
   * @returns {Promise<void>}
   */
  const handleDropdownSelection = async (value: string): Promise<void> => {
    if (value === "custom") {
      setSelectionMode("custom");
      setRewardInput("");
    } else {
      setSelectionMode("local");
      setRewardInput(value);
      const previous = config.poolAddress;
      onUpdate("poolAddress", value);
      try {
        await setPoolAddress(value);
      } catch (err) {
        console.error("Failed to set pool address", err);
        onUpdate("poolAddress", previous);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const REWARD_OPTIONS = [
    ...accounts.map((acc) => ({
      label: `${acc.label} (${acc.address.substring(0, 6)}...${acc.address.substring(acc.address.length - 4)})`,
      value: acc.address,
    })),
    { label: t("settings:miningSettings.customAddress"), value: "custom" },
  ];

  const selectedRewardOption =
    selectionMode === "custom"
      ? REWARD_OPTIONS.find((opt) => opt.value === "custom")!
      : REWARD_OPTIONS.find((opt) => opt.value === rewardInput) ||
        REWARD_OPTIONS[0];

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-100 mb-6">
        {t("settings:miningSettings.subtitle")}
      </h2>

      <div className="space-y-8">
        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:miningSettings.mining")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:miningSettings.enableTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:miningSettings.enableDesc")}
                </p>
              </div>
              <button
                onClick={() => handleToggleMining(!config.isMiningEnabled)}
                className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${config.isMiningEnabled ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700"}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.isMiningEnabled ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:miningSettings.startLaunchTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:miningSettings.startLaunchDesc")}
                </p>
              </div>
              <button
                onClick={() => onUpdate("startAtLaunch", !config.startAtLaunch)}
                className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${config.startAtLaunch ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700"}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.startAtLaunch ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:miningSettings.worker")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                    {t("settings:miningSettings.cpuThreadsTitle")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                    {t("settings:miningSettings.cpuThreadsDesc", {
                      count: config.cpuThreads,
                      max: MAX_CORES,
                    })}
                  </p>
                </div>
                <span className="text-sm font-bold font-mono text-slate-800 dark:text-gray-100 bg-slate-100 dark:bg-gray-800 px-2 py-1 rounded">
                  {t("settings:miningSettings.coreCount", {
                    count: config.cpuThreads,
                  })}
                </span>
              </div>

              <div className="flex gap-1 h-3 mb-2">
                {Array.from({ length: MAX_CORES }, (_, i) => i + 1).map(
                  (core) => (
                    <button
                      key={core}
                      onClick={() => handleThreadChange(core)}
                      className={`flex-1 rounded-sm transition-colors ${
                        core <= config.cpuThreads
                          ? "bg-emerald-500 hover:bg-emerald-600"
                          : "bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700"
                      }`}
                      title={t("settings:miningSettings.coreCount", {
                        count: core,
                      })}
                    />
                  ),
                )}
              </div>
              <div className="flex justify-between text-[10px] font-medium text-slate-400 dark:text-gray-500">
                <span>1</span>
                <span>{Math.ceil(MAX_CORES / 2)}</span>
                <span>{MAX_CORES}</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:miningSettings.intensityTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:miningSettings.intensityDesc")}
                </p>
              </div>
              <div className="flex items-center bg-slate-100 dark:bg-gray-800 rounded-lg p-1">
                {Object.values(MiningIntensity).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => onUpdate("intensity", opt)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                      config.intensity === opt
                        ? "bg-white dark:bg-gray-700 text-slate-800 dark:text-gray-100 shadow-sm"
                        : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                    }`}
                  >
                    {t(INTENSITY_LABEL_KEYS[opt])}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:miningSettings.pauseTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:miningSettings.pauseDesc")}
                </p>
              </div>
              <button
                onClick={() =>
                  onUpdate("pauseOnBattery", !config.pauseOnBattery)
                }
                className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${config.pauseOnBattery ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700"}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.pauseOnBattery ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:miningSettings.rewards")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <div className="p-4 flex flex-col gap-3">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-0.5">
                  {t("settings:miningSettings.rewardAddressTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400">
                  {t("settings:miningSettings.rewardAddressDesc")}
                </p>
              </div>

              <div className="w-full">
                <CustomDropdown<{ label: string; value: string }>
                  options={REWARD_OPTIONS}
                  selected={selectedRewardOption}
                  onSelect={(opt) => handleDropdownSelection(opt.value)}
                  renderSelected={(selected) =>
                    selected?.label || t("settings:miningSettings.selectWallet")
                  }
                  renderOption={(option) => option.label}
                />
              </div>

              {selectionMode === "custom" && (
                <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600" />
                  </div>
                  <input
                    type="text"
                    value={rewardInput}
                    onChange={(e) => handlePoolAddressChange(e.target.value)}
                    placeholder={t(
                      "settings:miningSettings.customAddressPlaceholder",
                    )}
                    className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm font-medium text-slate-800 dark:text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
