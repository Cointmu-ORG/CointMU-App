import { MAX_PEERS_OPTIONS, RECOMMENDED_MAX_PEERS } from "@/features/settings";
import { COINTMU_NETWORK } from "@bridge/network";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsStore } from "@/features/settings";
import { useAppStore } from "@/shared/model";
import { CustomDropdown } from "@/shared/ui";
import { BootnodeSettings } from "./bootnode-settings.component";
import { ListenPortRow } from "./listen-port-row.component";

interface NetworkSettingsProps {
  config: SettingsStore["network"];
  onUpdate: (key: string, value: any) => Promise<void> | void;
}

/**
 * Network settings pane: the active network (read-only), peer limit, listen
 * port and bootnodes. Discovery, sync mode and pruning are hidden until geth
 * gets their flags (#104); their stored values are kept.
 * @param props The configuration state and the update callback.
 * @returns The Network Settings form component.
 */
export function NetworkSettings({
  config,
  onUpdate,
}: NetworkSettingsProps): JSX.Element {
  const { t } = useTranslation();
  const peerCount = useAppStore((s) => s.peerCount);
  const maxPeersLabel = (peers: number): string =>
    peers === RECOMMENDED_MAX_PEERS
      ? t("settings:options.recommendedValue", { value: peers })
      : String(peers);

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
            <div className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-gray-800/30">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.networkTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:networkSettings.networkDesc")}
                </p>
              </div>
              <span className="text-sm font-bold text-slate-700 dark:text-gray-300">
                {COINTMU_NETWORK.name} · chain ID {COINTMU_NETWORK.chainId}
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

            <ListenPortRow
              key={config.listenPort}
              port={config.listenPort}
              onSave={(port) => onUpdate("listenPort", port)}
            />

            <div className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-gray-800/30">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:networkSettings.connectedPeersTitle")}
                </p>
                {peerCount !== null && (
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                    {t("settings:networkSettings.connectedPeersDesc", {
                      count: peerCount,
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <BootnodeSettings />
      </div>
    </div>
  );
}
