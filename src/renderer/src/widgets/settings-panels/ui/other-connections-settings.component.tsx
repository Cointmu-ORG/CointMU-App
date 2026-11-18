import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { useStoredSetting } from "@/features/settings";
import { fetchMiningStats, type MiningStats } from "@/features/mining";
import { formatHashrate } from "@/shared/lib";
import { CopyableValue } from "./copyable-value.component";
import {
  SettingRow,
  SettingSwitch,
  SettingsGroup,
} from "./setting-controls.component";
import {
  ExternalMinerStatus,
  resolveExternalMinerStatus,
} from "../lib/external-miner-status";

const STATS_REFRESH_MS = 5_000;
// Matches geth's --http.addr; the endpoint is never offered on the LAN.
const LOCAL_RPC_HOST = "127.0.0.1";

interface OtherConnectionsSettingsProps {
  /** The stored reward address (mining.poolAddress); empty when unset. */
  rewardAddress: string;
}

/**
 * Settings → Other connections: what an external GPU miner the user installed
 * themselves needs to mine through this node over getWork (eth_getWork,
 * eth_submitWork, eth_submitHashrate), and whether one is reporting. The app
 * ships and starts no miner program.
 * @param props - The reward address blocks are credited to.
 * @returns The settings pane.
 */
export function OtherConnectionsSettings({
  rewardAddress,
}: OtherConnectionsSettingsProps): JSX.Element {
  const { t } = useTranslation();
  const [isExternalMiner, setIsExternalMiner] = useStoredSetting(
    "mining.externalMiner",
    false,
  );
  const [rpcPort, setRpcPort] = useState<number | null>(null);
  const [stats, setStats] = useState<MiningStats | null>(null);

  useEffect(() => {
    let isMounted = true;
    const refresh = async (): Promise<void> => {
      // The port is re-read too: a node restart may pick another one.
      const [port, latest] = await Promise.all([
        window.api.getRpcPort(),
        fetchMiningStats(),
      ]);
      if (!isMounted) return;
      setRpcPort(port);
      setStats(latest);
    };
    const refreshSafely = (): void => {
      refresh().catch((err: unknown) => {
        console.error("Failed to read the external miner status", err);
      });
    };
    refreshSafely();
    const interval = setInterval(refreshSafely, STATS_REFRESH_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const endpoint =
    rpcPort === null ? "" : `http://${LOCAL_RPC_HOST}:${rpcPort}`;
  const statusText = {
    [ExternalMinerStatus.OFF]: t("settings:otherConnections.statusOff"),
    [ExternalMinerStatus.IDLE]: t("settings:otherConnections.statusIdle"),
    [ExternalMinerStatus.WAITING]: t("settings:otherConnections.statusWaiting"),
    [ExternalMinerStatus.REPORTING]: t(
      "settings:otherConnections.statusReporting",
      { hashrate: formatHashrate(stats?.hashrate ?? 0) },
    ),
  }[resolveExternalMinerStatus(isExternalMiner, stats)];
  const externalTitle = t("settings:otherConnections.externalTitle");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-gray-100">
          {t("settings:otherConnections.title")}
        </h2>
        <p className="text-sm text-slate-500 dark:text-gray-400 mt-1 leading-relaxed">
          {t("settings:otherConnections.description")}
        </p>
      </div>

      <p
        role="note"
        className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-xs font-medium text-amber-800 dark:text-amber-200 leading-relaxed"
      >
        <AlertTriangle
          width={16}
          height={16}
          aria-hidden="true"
          className="flex-shrink-0 mt-0.5"
        />
        {t("settings:otherConnections.fairnessWarning")}
      </p>

      <SettingsGroup title={t("settings:otherConnections.gpuMiner")}>
        <SettingRow
          title={externalTitle}
          description={t("settings:otherConnections.externalDesc")}
        >
          <SettingSwitch
            label={externalTitle}
            checked={isExternalMiner}
            onChange={setIsExternalMiner}
          />
        </SettingRow>
        <SettingRow
          title={t("settings:otherConnections.endpointTitle")}
          description={t("settings:otherConnections.endpointDesc")}
        >
          {endpoint && <CopyableValue value={endpoint} />}
        </SettingRow>
        <SettingRow
          title={t("settings:otherConnections.rewardTitle")}
          description={
            rewardAddress ? (
              <span className="font-mono break-all">{rewardAddress}</span>
            ) : (
              t("settings:otherConnections.rewardMissing")
            )
          }
        />
        <SettingRow
          title={t("settings:otherConnections.statusTitle")}
          description={<span aria-live="polite">{statusText}</span>}
        />
        <SettingRow
          title={t("settings:otherConnections.commandTitle")}
          description={t("settings:otherConnections.commandDesc")}
        >
          {endpoint && <CopyableValue value={`ethminer -P ${endpoint}`} />}
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
