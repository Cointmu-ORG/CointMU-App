import { UPTIME_REFRESH_MS, EXTERNAL_LINKS } from "@/features/settings";
import { useState, useEffect, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { useUpdater } from "@/shared/lib";
import { useAppStore } from "@/shared/model";
import { Layers } from "lucide-react";

/**
 * Formats raw system uptime seconds into a readable string.
 * @param {number} seconds - The total uptime in seconds.
 * @returns {string} The formatted uptime string.
 */
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/**
 * Formats an uptime as its two largest units in the given language
 * (e.g. '2 days, 3 hours', '5 Minuten, 12 Sekunden').
 * @param seconds - Uptime in seconds.
 * @param locale - The active UI locale.
 * @returns The localized duration.
 */
const formatUptime = (seconds: number, locale: string): string => {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = Math.floor(seconds % SECONDS_PER_MINUTE);
  const duration =
    days > 0
      ? { days, hours }
      : hours > 0
        ? { hours, minutes }
        : minutes > 0
          ? { minutes, seconds: secs }
          : { seconds: secs };
  return new Intl.DurationFormat(locale, { style: "long" }).format(duration);
};

/**
 * Formats a byte count into a compact human-readable size string.
 * @param {number} bytes - The number of bytes to format.
 * @returns {string} The formatted size (for example '12.3 MB').
 */
const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

/**
 * About pane containing system information, node version, chain ID,
 * uptime, external resource links, and an integrated auto-update control
 * bound to the Electron IPC bridge.
 * @returns {JSX.Element} The About Settings view component.
 */
export function AboutSettings(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [uptimeSeconds, setUptimeSeconds] = useState<number | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  const peerCount = useAppStore((s) => s.peerCount);
  const updater = useUpdater();

  const sysInfo = window.systemInfo || {
    version: "0.0.1",
    codename: "",
    build: "00000000",
    platform: "Unknown",
    nodeVersion: "Unknown",
    getUptime: () => 0,
  };

  useEffect(() => {
    const updateUptime = (): void => {
      setUptimeSeconds(sysInfo.getUptime());
    };
    updateUptime();
    const interval = setInterval(updateUptime, UPTIME_REFRESH_MS);

    const fetchGenesis = async (): Promise<void> => {
      try {
        const genesis = await window.api.network.getGenesisConfig();
        if (genesis && genesis.config && genesis.config.chainId) {
          setChainId(genesis.config.chainId);
        }
      } catch (err) {
        console.error("Failed to fetch genesis config", err);
      }
    };
    fetchGenesis();

    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="flex items-start gap-6 mb-12">
        <div className="w-20 h-20 rounded-2xl bg-blue-500 flex items-center justify-center flex-shrink-0 shadow-md">
          <Layers width={40} height={40} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CointMU</h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {t("settings:about.versionLine", {
              version: `${window.systemInfo?.version || "0.0.1"}${
                window.systemInfo?.codename
                  ? `-${window.systemInfo.codename}`
                  : ""
              }`,
              build: window.systemInfo?.build || "00000000",
            })}{" "}
            {"\u2022"}{" "}
            {window.systemInfo?.platform || t("settings:about.unknownPlatform")}
          </p>
          <p className="text-sm font-medium text-slate-400 mt-1">
            {"\u00A9"} 2026 CointMU Foundation {"\u2022"} MIT License
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() =>
                window.open(EXTERNAL_LINKS.RELEASE_NOTES, "_blank")
              }
              className="px-4 py-1.5 bg-slate-100 dark:bg-gray-800 text-slate-800 dark:text-white rounded-lg text-sm font-bold border border-slate-200 dark:border-gray-700 hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors"
            >
              {t("settings:about.releaseNotes")}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:about.update")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl shadow-sm p-4">
            {updater.status === "checking" && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                    {t("settings:about.checkingUpdateTitle")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                    {t("settings:about.checkingUpdateDesc")}
                  </p>
                </div>
                <button
                  disabled
                  className="px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm bg-slate-300 text-slate-500 dark:text-gray-400 cursor-not-allowed"
                >
                  {t("settings:about.checkingUpdateBtn")}
                </button>
              </div>
            )}

            {updater.status === "available" && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                    {t("settings:about.availableUpdateTitle")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                    {t("settings:about.availableUpdateDesc", {
                      version: updater.info?.version ?? "unknown",
                    })}
                  </p>
                </div>
                <button
                  onClick={() => updater.download()}
                  className="px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                >
                  {t("settings:about.downloadUpdateBtn")}
                </button>
              </div>
            )}

            {updater.status === "downloading" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                    {t("settings:about.downloadingUpdateTitle")}
                  </p>
                  <span className="text-sm font-medium font-mono text-slate-600">
                    {Math.round(updater.progress?.percent ?? 0)}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out"
                    style={{ width: `${updater.progress?.percent ?? 0}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-2">
                  {formatBytes(updater.progress?.transferred ?? 0)} /{" "}
                  {formatBytes(updater.progress?.total ?? 0)}
                </p>
              </div>
            )}

            {updater.status === "downloaded" && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                    {t("settings:about.readyUpdateTitle")}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                    {t("settings:about.readyUpdateDesc", {
                      version: updater.info?.version ?? "unknown",
                    })}
                  </p>
                </div>
                <button
                  onClick={() => updater.install()}
                  className="px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                >
                  {t("settings:about.restartUpdateBtn")}
                </button>
              </div>
            )}

            {(updater.status === "idle" ||
              updater.status === "not-available" ||
              updater.status === "error") && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                    {t("settings:about.softwareUpdateTitle")}
                  </p>
                  {updater.status === "error" ? (
                    <p className="text-xs text-red-500 mt-0.5">
                      {updater.error ?? t("settings:about.updateError")}
                    </p>
                  ) : updater.status === "not-available" ? (
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                      {t("settings:about.latestVersion")}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                      {t("settings:about.checkUpdateDesc")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => updater.check()}
                  className="px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                >
                  {t("settings:about.checkUpdateBtn")}
                </button>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:about.system")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <div className="flex items-center justify-between p-4">
              <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                {t("settings:about.nodeVersion")}
              </p>
              <span className="text-sm font-medium font-mono text-slate-600">
                cointmu/v{sysInfo.version}-{sysInfo.codename || "stable"} (Node
                v{sysInfo.nodeVersion})
              </span>
            </div>

            <div className="flex items-center justify-between p-4">
              <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                {t("settings:about.chainId")}
              </p>
              <span className="text-sm font-medium font-mono text-slate-600">
                {chainId !== null ? chainId : "--"}
              </span>
            </div>

            <div className="flex items-center justify-between p-4">
              <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                {t("settings:about.connectedPeers")}
              </p>
              <span className="text-sm font-medium font-mono text-slate-600">
                {peerCount !== null ? peerCount : "--"}
              </span>
            </div>

            <div className="flex items-center justify-between p-4">
              <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                {t("settings:about.uptime")}
              </p>
              <span className="text-sm font-bold text-slate-800 dark:text-gray-100">
                {uptimeSeconds === null
                  ? t("settings:about.uptimeLoading")
                  : formatUptime(uptimeSeconds, i18n.language)}
              </span>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 dark:text-gray-400 mb-3">
            {t("settings:about.links")}
          </h3>
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 shadow-sm">
            <button
              onClick={() =>
                window.open(EXTERNAL_LINKS.DOCUMENTATION, "_blank")
              }
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors group"
            >
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:about.documentationTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:about.documentationDesc")}
                </p>
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-gray-100 group-hover:text-blue-500 transition-colors">
                {t("settings:about.openLink")}
              </span>
            </button>

            <button
              onClick={() => window.open(EXTERNAL_LINKS.GITHUB_REPO, "_blank")}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors group"
            >
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:about.githubTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  github.com/kakonoomoidee/CointMU
                </p>
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-gray-100 group-hover:text-blue-500 transition-colors">
                {t("settings:about.openLink")}
              </span>
            </button>

            <button
              onClick={() => window.open(EXTERNAL_LINKS.REPORT_ISSUE, "_blank")}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors group"
            >
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800 dark:text-gray-100">
                  {t("settings:about.reportIssueTitle")}
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  {t("settings:about.reportIssueDesc")}
                </p>
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-gray-100 group-hover:text-blue-500 transition-colors">
                {t("settings:about.openLink")}
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
