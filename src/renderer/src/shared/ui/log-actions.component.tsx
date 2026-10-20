import { useEffect, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import ms from "ms";
import { copyRecentLogs, openLogsFolder } from "@/shared/api";

const COPY_FEEDBACK_MS = ms("2s");

type CopyStatus = "idle" | "copied" | "failed";

const COPY_LABEL_KEYS: Record<CopyStatus, string> = {
  idle: "common:logs.copyRecent",
  copied: "common:logs.copied",
  failed: "common:logs.copyFailed",
};

export interface LogActionsProps {
  /** Classes applied to both buttons, so the actions match their container. */
  readonly buttonClassName: string;
}

/**
 * "Open logs folder" and "Copy recent logs" buttons. Copied logs are sanitized
 * by the main process before they reach the clipboard.
 * @param props - Button styling.
 * @returns The two log action buttons.
 */
export function LogActions({ buttonClassName }: LogActionsProps): JSX.Element {
  const { t } = useTranslation("common");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = setTimeout(() => setCopyStatus("idle"), COPY_FEEDBACK_MS);
    return (): void => clearTimeout(timer);
  }, [copyStatus]);

  const handleOpen = async (): Promise<void> => {
    try {
      await openLogsFolder();
    } catch (err) {
      console.error("[logs] Failed to open the logs folder", err);
    }
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await copyRecentLogs();
      setCopyStatus("copied");
    } catch (err) {
      console.error("[logs] Failed to copy recent logs", err);
      setCopyStatus("failed");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleOpen()}
        className={buttonClassName}
      >
        {t("common:logs.openFolder")}
      </button>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-live="polite"
        className={buttonClassName}
      >
        {t(COPY_LABEL_KEYS[copyStatus])}
      </button>
    </>
  );
}
