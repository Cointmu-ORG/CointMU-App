import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { ShellText } from "@bridge/types";
import { setShellText } from "@/shared/api";

/**
 * @param t - Translation function.
 * @returns The tray text in the current language; placeholders stay for main.
 */
function buildShellText(t: TFunction): ShellText {
  const keep = { interpolation: { skipOnVariables: true } };
  return {
    trayOpen: t("common:shell.trayOpen"),
    trayStartMining: t("common:shell.trayStartMining"),
    trayStopMining: t("common:shell.trayStopMining"),
    trayQuit: t("common:shell.trayQuit"),
    traySyncing: t("common:shell.traySyncing", {
      ...keep,
      percent: "{{percent}}",
    }),
    traySynced: t("common:shell.traySynced"),
    trayOffline: t("common:shell.trayOffline"),
    trayMining: t("common:shell.trayMining"),
    trayNotMining: t("common:shell.trayNotMining"),
    trayPeers: t("common:shell.trayPeers", { ...keep, count: "{{count}}" }),
  };
}

/**
 * Keeps the main process's tray text in the UI language: sends it on start
 * and on every language change.
 */
export function useShellText(): void {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  useEffect(() => {
    setShellText(buildShellText(t)).catch((err: unknown) => {
      console.error("Failed to send the tray text", err);
    });
  }, [t, language]);
}
