import {
  NETWORK_OPTIONS,
  MAX_PEERS_OPTIONS,
  RECOMMENDED_MAX_PEERS,
  SYNC_MODE_OPTIONS,
} from "../config/settings.constants";
import type { SyncMode } from "@bridge/setting-values";
import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import type { CustomNetwork, SettingsStore } from "@/features/settings";
import { CustomDropdown } from "@/shared/ui";
import { SYNC_MODE_LABEL_KEYS } from "@/shared/lib";
import { AddNetworkModal } from "./add-network-modal.component";
import { BootnodeSettings } from "./bootnode-settings.component";

interface NetworkSettingsProps {
  config: SettingsStore["network"];
  onUpdate: (key: string, value: any) => Promise<void> | void;
}

/**
 * Network settings pane containing active network configuration, RPC endpoints,
 * peer bounds, and sync mode configuration.
 * @param props The configuration state and the update callback.
 * @returns The Network Settings form component.
 */
export function NetworkSettings({
  config,
  onUpdate,
}: NetworkSettingsProps): JSX.Element {
  const { t } = useTranslation();
  const maxPeersLabel = (peers: number): string =>
    peers === RECOMMENDED_MAX_PEERS
      ? t("settings:options.recommendedValue", { value: peers })
      : String(peers);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const customNetworks = config.customNetworks || [];
  const options = [
    ...NETWORK_OPTIONS,
    ...customNetworks.map((n) => n.name),
    "+ Add Network",
  ];

  const handleNetworkSwitch = async (val: string): Promise<void> => {
    if (val === "+ Add Network") {
      setIsAddModalOpen(true);
      return;
    }

    onUpdate("network", val);

    let chainId = 1912;
    if (val.includes("7013")) chainId = 7013;
    else if (val.includes("Localhost")) chainId = 1337;
    else {
      const custom = customNetworks.find((n) => n.name === val);
      if (custom) chainId = custom.chainId;
    }

    setIsSwitching(true);
    try {
      await window.api.network.setChainId(chainId);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleAddCustomNetwork = async (
    network: CustomNetwork,
  ): Promise<void> => {
    const updatedNetworks = [...customNetworks, network];
    await onUpdate("customNetworks", updatedNetworks);
    setIsAddModalOpen(false);
    await handleNetworkSwitch(network.name);
  };

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-100 mb-6">
        {t("settings:networkSettings.subtitle")}
      </h2>

      <div className="space-y-8">
        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:networkSettings.activeNetwork")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.networkTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:networkSettings.networkDesc")}
                </p>
              </div>
              <div className="w-64">
                <CustomDropdown<string>
                  options={options}
                  selected={config.network}
                  onSelect={handleNetworkSwitch}
                  renderSelected={(selected) => selected || NETWORK_OPTIONS[0]}
                  renderOption={(option) => {
                    if (option === "+ Add Network") {
                      return (
                        <span className="text-blue-500 font-bold">
                          {t("settings:network.addNetworkOption")}
                        </span>
                      );
                    }
                    return option;
                  }}
                  compact
                />
                {isSwitching && (
                  <div className="mt-3 text-[11px] text-blue-600 font-medium animate-pulse bg-blue-50 p-2 rounded border border-blue-100">
                    <p>{t("settings:networkSettings.switchingNetwork")}</p>
                    <p className="mt-0.5 opacity-80">
                      {t("settings:networkSettings.restartRequired")}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.rpcTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:networkSettings.rpcDesc")}
                </p>
              </div>
              <div className="w-64">
                <input
                  type="text"
                  value={config.rpcEndpoint}
                  onChange={(e) => onUpdate("rpcEndpoint", e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-800 dark:text-gray-100 dark:text-gray-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-gray-800/30">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.chainIdTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:networkSettings.chainIdDesc")}
                </p>
              </div>
              <span className="text-sm font-bold font-mono text-slate-700 dark:text-gray-300">
                1912
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-gray-800/30">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.blockTimeTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:networkSettings.blockTimeDesc")}
                </p>
              </div>
              <span className="text-sm font-bold font-mono text-slate-700 dark:text-gray-300">
                30s
              </span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:networkSettings.peers")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.maxPeersTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:networkSettings.maxPeersDesc")}
                </p>
              </div>
              <div className="w-56">
                <CustomDropdown<number>
                  options={MAX_PEERS_OPTIONS}
                  selected={
                    MAX_PEERS_OPTIONS.includes(config.maxPeers)
                      ? config.maxPeers
                      : RECOMMENDED_MAX_PEERS
                  }
                  onSelect={(val) => onUpdate("maxPeers", val)}
                  renderSelected={(selected) =>
                    selected === null ? null : maxPeersLabel(selected)
                  }
                  renderOption={maxPeersLabel}
                  compact
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.discoveryTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:networkSettings.discoveryDesc")}
                </p>
              </div>
              <button
                onClick={() => onUpdate("discovery", !config.discovery)}
                className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${config.discovery ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700"}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.discovery ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-gray-800/30">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.listenPortTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:networkSettings.listenPortDesc")}
                </p>
              </div>
              <span className="text-sm font-bold font-mono text-slate-700 dark:text-gray-300">
                {config.listenPort}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-gray-800/30">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.connectedPeersTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:networkSettings.connectedPeersDesc", {
                    count: 14,
                  })}
                </p>
              </div>
              <button className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-xs font-bold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-700 shadow-sm transition-colors">
                {t("settings:networkSettings.viewList")}
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:networkSettings.sync")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <div className="flex items-center justify-between p-4">
              <div className="pr-4">
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.syncModeTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                  {t("settings:networkSettings.syncModeDesc")}
                </p>
              </div>
              <div className="w-56 flex-shrink-0">
                <CustomDropdown<SyncMode>
                  options={SYNC_MODE_OPTIONS}
                  selected={config.syncMode}
                  onSelect={(val) => onUpdate("syncMode", val)}
                  renderSelected={(selected) =>
                    t(SYNC_MODE_LABEL_KEYS[selected ?? SYNC_MODE_OPTIONS[0]])
                  }
                  renderOption={(option) => t(SYNC_MODE_LABEL_KEYS[option])}
                  compact
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.pruneTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:networkSettings.pruneDesc")}
                </p>
              </div>
              <button
                onClick={() => onUpdate("pruneOldState", !config.pruneOldState)}
                className={`w-11 h-6 rounded-full flex items-center transition-colors px-0.5 ${config.pruneOldState ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700"}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.pruneOldState ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
          </div>
        </section>

        <BootnodeSettings />
      </div>
      <AddNetworkModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleAddCustomNetwork}
      />
    </div>
  );
}
