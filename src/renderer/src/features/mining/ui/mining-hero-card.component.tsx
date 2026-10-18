import { BLOCK_REWARD_CMU } from "../config/mining.constants";
import { type JSX } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui";
import { Play, Square } from "lucide-react";
import { NonceCounter } from "./nonce-counter.component";
import { SyncProgress } from "./sync-progress.component";
import type { SyncStatus } from "../model/sync-status.types";

interface MiningHeroCardProps {
  isMining: boolean;
  isGeneratingDag: boolean;
  dagProgress: number;
  isConnected: boolean;
  cpuThreads: number;
  hashrateLabel: string;
  formattedRewards: string;
  difficultyLabel: string;
  toggling: boolean;
  sync: SyncStatus;
  onToggle: (enabled: boolean) => void;
}

interface HeroCardShellProps {
  gradientClass: string;
  blobColorClass: string;
  children: React.ReactNode;
}

interface RewardsBadgeProps {
  value: string;
  muted?: boolean;
}

/**
 * Shared outer wrapper for all three hero card states. Renders the rounded
 * gradient container, the decorative blur blob, and the relative content area.
 * @param props - The gradient class, blob color class, and child content.
 * @returns The rendered hero card shell.
 */
function HeroCardShell({
  gradientClass,
  blobColorClass,
  children,
}: HeroCardShellProps): JSX.Element {
  return (
    <div
      className={`rounded-2xl ${gradientClass} p-7 text-white relative overflow-hidden`}
    >
      <div
        className={`absolute -right-16 -top-16 w-64 h-64 rounded-full ${blobColorClass} blur-2xl`}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * Read-only rewards display shared across all three hero card states. Shows the
 * 'Rewards today' label and a formatted CMU value with optional muted styling
 * for inactive states.
 * @param props - The formatted value string and optional muted flag.
 * @returns The rendered rewards badge.
 */
function RewardsBadge({
  value,
  muted = false,
}: RewardsBadgeProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="text-right">
      <p
        className={`text-[10px] font-semibold tracking-wider uppercase ${muted ? "text-white/40" : "text-white/50"}`}
      >
        {t("mining:hero.rewardsToday")}
      </p>
      <p
        className={`text-xl font-bold mt-0.5 ${muted ? "text-white/70" : "text-white"}`}
      >
        {value}
        <span
          className={`text-sm font-medium ml-1.5 ${muted ? "text-white/40" : "text-white/60"}`}
        >
          CMU
        </span>
      </p>
    </div>
  );
}

/**
 * Hero card for the mining view that renders one of three mutually exclusive
 * states: actively mining, generating the verification DAG, or idle. Each state
 * presents the relevant hashrate, rewards, and primary action.
 * @param props - Telemetry, config, derived labels, and the toggle handler.
 * @returns The rendered hero card for the current mining state.
 */
function MiningHeroCard({
  isMining,
  isGeneratingDag,
  dagProgress,
  isConnected,
  cpuThreads,
  hashrateLabel,
  formattedRewards,
  difficultyLabel,
  toggling,
  sync,
  onToggle,
}: MiningHeroCardProps): JSX.Element {
  const { t } = useTranslation();
  const isSynced = sync.status === "synced";
  const startBlockedTooltip =
    sync.status === "no-peers"
      ? t("mining:hero.noPeersTooltip")
      : t("mining:hero.nodeSyncingTooltip");

  if (isMining) {
    return (
      <HeroCardShell
        gradientClass="bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-950"
        blobColorClass="bg-emerald-600/20"
      >
        <div className="absolute -left-8 -bottom-8 w-40 h-40 rounded-full bg-emerald-500/10" />

        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-bold tracking-tight font-mono">
                {hashrateLabel}
              </span>
              <span className="text-xl font-semibold text-white/70">MH/s</span>
            </div>
            <p className="text-sm text-white/60 mt-2">
              {t("mining:hero.miningWithThreads", { count: cpuThreads })}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <RewardsBadge value={`+${formattedRewards}`} />
            <Button
              id="miner-Square-button"
              variant="danger"
              size="lg"
              onClick={() => onToggle(false)}
              disabled={toggling}
              leftIcon={<Square width={14} height={14} />}
            >
              {toggling
                ? t("mining:hero.Squareping")
                : t("mining:hero.stopMiningbtn")}
            </Button>
          </div>
        </div>

        <NonceCounter />

        <div className="flex items-center justify-between text-xs text-white/40 font-mono">
          <span>
            {t("mining:hero.targetDifficulty")} {difficultyLabel}
          </span>
          <span>
            {t("mining:hero.blockReward")} {BLOCK_REWARD_CMU} CMU
          </span>
        </div>
      </HeroCardShell>
    );
  }

  if (isGeneratingDag) {
    return (
      <HeroCardShell
        gradientClass="bg-gradient-to-br from-slate-800 via-slate-850 to-slate-950"
        blobColorClass="bg-slate-700/20"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold tracking-wider uppercase text-emerald-400">
            {t("mining:hero.initializing")}
          </span>
        </div>

        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-bold tracking-tight font-mono text-white/90">
                {dagProgress}
              </span>
              <span className="text-xl font-semibold text-white/50">%</span>
            </div>
            <p className="text-sm text-white/50 mt-2">
              {t("mining:hero.generatingDag")}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <RewardsBadge value="0.00" muted />
            <Button variant="success" size="lg" disabled>
              {t("mining:hero.generatingDagBtn")}
            </Button>
          </div>
        </div>

        <div className="mt-4 mb-3">
          <div className="w-full h-1.5 rounded-full bg-slate-900/50 overflow-hidden relative">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-300 ease-out"
              style={{ width: `${dagProgress}%` }}
            />
          </div>
        </div>
      </HeroCardShell>
    );
  }

  return (
    <HeroCardShell
      gradientClass="bg-gradient-to-br from-slate-800 via-slate-850 to-slate-950"
      blobColorClass="bg-slate-700/20"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-slate-500" />
        <span className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          {t("mining:hero.idle")}
        </span>
      </div>

      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold tracking-tight font-mono text-white/80">
              0.00
            </span>
            <span className="text-xl font-semibold text-white/40">MH/s</span>
          </div>
          {isConnected && !isSynced ? (
            <SyncProgress sync={sync} />
          ) : (
            <p className="text-sm text-white/50 mt-2">
              {isConnected ? (
                <>
                  {t("mining:hero.pressStart")}{" "}
                  <span className="font-semibold text-white/70">2 CMU</span>{" "}
                  {t("mining:hero.perBlock")}
                </>
              ) : (
                <>{t("mining:hero.waitingForNode")}</>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <RewardsBadge value="0.00" muted />
          <Button
            id="miner-start-button"
            variant="success"
            size="lg"
            onClick={() => onToggle(true)}
            disabled={toggling || !isConnected || !isSynced}
            title={
              !isConnected
                ? t("mining:hero.waitingForNodeTooltip")
                : !isSynced
                  ? startBlockedTooltip
                  : ""
            }
            leftIcon={<Play width={14} height={14} />}
          >
            {toggling
              ? t("mining:hero.starting")
              : t("mining:hero.startMiningBtn")}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-white/30 font-mono mt-4">
        <span>
          {t("mining:hero.targetDifficulty")} {difficultyLabel}
        </span>
        <span>
          {t("mining:hero.blockReward")} {BLOCK_REWARD_CMU} CMU
        </span>
      </div>
    </HeroCardShell>
  );
}

export { MiningHeroCard };
export type { MiningHeroCardProps };
