import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui";
import { StatusPill } from "./status-pill.component";
import { Settings } from "lucide-react";

interface MiningHeaderProps {
  isMining: boolean;
  powerStatus: string;
  onNavigate: (view: string, payload?: string) => void;
}

/**
 * Mining view header showing the workspace breadcrumb, the live mining status
 * pill, and the preferences action.
 * @param props - The current mining flag and node power status.
 * @returns The rendered mining header.
 */
function MiningHeader({
  isMining,
  powerStatus,
  onNavigate,
}: MiningHeaderProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between px-8 py-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-widest uppercase text-slate-400">
          {t("mining:header.workspace")}
        </span>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-semibold text-slate-800">
          {t("mining:header.title")}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {isMining ? (
          <StatusPill
            tone="success"
            label={t("mining:header.statusMining")}
            pulse
          />
        ) : powerStatus === "Paused (Battery)" ? (
          <StatusPill tone="warning" label={t("mining:header.pausedBattery")} />
        ) : (
          <StatusPill
            tone="neutral"
            label={t("mining:header.statusStopped")}
            showDot={false}
          />
        )}

        <Button
          variant="secondary"
          leftIcon={<Settings width={14} height={14} />}
          onClick={() => onNavigate("settings", "mining")}
        >
          {t("mining:header.preferences")}
        </Button>
      </div>
    </header>
  );
}

export { MiningHeader };
export type { MiningHeaderProps };
