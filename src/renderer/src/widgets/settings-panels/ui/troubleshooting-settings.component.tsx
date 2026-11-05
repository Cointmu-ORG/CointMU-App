import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { exportDiagnosticBundle, openLogsFolder } from "@/shared/api";
import {
  SettingButton,
  SettingRow,
  SettingsGroup,
} from "./setting-controls.component";

type ExportStatus = "idle" | "busy" | "saved" | "failed";

/**
 * Settings → General → Troubleshooting: the log folder and the diagnostic
 * bundle export.
 * @returns The section.
 */
export function TroubleshootingSettings(): JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ExportStatus>("idle");

  const exportBundle = async (): Promise<void> => {
    setStatus("busy");
    try {
      const isSaved = await exportDiagnosticBundle({
        title: t("settings:general.diagnosticsSaveTitle"),
        filterName: t("settings:general.diagnosticsZip"),
      });
      setStatus(isSaved ? "saved" : "idle");
    } catch (err) {
      console.error("Failed to export the diagnostic bundle", err);
      setStatus("failed");
    }
  };

  return (
    <SettingsGroup title={t("settings:general.troubleshooting")}>
      <SettingRow
        title={t("settings:general.logsTitle")}
        description={t("settings:general.logsDesc")}
      >
        <SettingButton
          onClick={() =>
            void openLogsFolder().catch((err: unknown) => {
              console.error("Failed to open the logs folder", err);
            })
          }
        >
          {t("settings:general.logsOpen")}
        </SettingButton>
      </SettingRow>
      <SettingRow
        title={t("settings:general.diagnosticsTitle")}
        description={
          <>
            {t("settings:general.diagnosticsDesc")}
            {(status === "saved" || status === "failed") && (
              <span
                role="status"
                className={`block mt-1 ${status === "saved" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
              >
                {status === "saved"
                  ? t("settings:general.diagnosticsSaved")
                  : t("settings:general.diagnosticsFailed")}
              </span>
            )}
          </>
        }
      >
        <SettingButton
          isDisabled={status === "busy"}
          onClick={() => void exportBundle()}
        >
          {t("settings:general.diagnosticsExport")}
        </SettingButton>
      </SettingRow>
    </SettingsGroup>
  );
}
