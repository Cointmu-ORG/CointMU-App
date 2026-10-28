import type { DerivedAccount } from "@/entities/account";
import {
  DASHBOARD_TICK_INTERVAL_MS,
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_POLL_INTERVAL_MS,
  PAST_HOUR_MS,
  SPARKLINE_BUCKET_MS,
  SPARKLINE_WINDOW_MS,
  TARGET_BLOCK_TIME_SECONDS,
} from "../config/dashboard.constants";
import { useState, useEffect, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { usePagination, useRecentBlocks } from "@/shared/lib";
import { useMiningStats, useMiningControls } from "@/features/mining";
import { useAppStore } from "@/shared/model";
import { useMiningStore } from "@/features/mining";
import { useWalletUiStore } from "@/features/wallet";
import { getTransactions } from "@/features/wallet";
import { ActivityCacheService } from "@/features/wallet";
import type { WalletActivity } from "@bridge/types";
import { toActivityRow } from "@/features/wallet";
import {
  formatBlockNumber,
  formatHashrate,
  formatDifficulty,
  formatMhs,
  isWithinLastDay,
} from "@/shared/lib";
import { resolveHistoryAddresses, filterFoundBlocks } from "@/features/wallet";
import { DashboardHeader } from "./dashboard-header.component";
import { WalletOverviewCard } from "./wallet-overview-card.component";

import { NetworkHealthPanel } from "./network-health-panel.component";
import { DashboardStatsGrid } from "./dashboard-stats-grid.component";
import { LatestBlocks } from "./latest-blocks.component";
import { ActivityFeed } from "./activity-feed.component";
import { SkeletonCard, SkeletonList, Skeleton } from "@/shared/ui";

interface DashboardProps {
  activeWalletAddress: string | null;
  accounts: DerivedAccount[];
  onNavigate: (view: string) => void;
}

/**
 * Primary dashboard view orchestrator. It sources global network and balance
 * state from the app store, local mining telemetry from the mining hooks, and
 * the wallet activity history over IPC, derives the formatted display values,
 * and composes the layout from focused presentational sub-components. Navigation
 * intents are forwarded to the application router.
 * @param props - The active wallet address and the view navigation callback.
 * @returns The complete dashboard layout.
 */
function DashboardPage({
  activeWalletAddress,
  accounts,
  onNavigate,
}: DashboardProps): JSX.Element {
  const blockHeight = useAppStore((s) => s.blockHeight);
  const peerCount = useAppStore((s) => s.peerCount);
  const gasPriceGwei = useAppStore((s) => s.gasPriceGwei);
  const difficulty = useAppStore((s) => s.difficulty);
  const isConnected = useAppStore((s) => s.isConnected);
  const loading = useAppStore((s) => s.loading);
  const balance = useAppStore((s) => s.balance);
  const recentBlocks = useRecentBlocks(blockHeight, isConnected);
  const { t, i18n } = useTranslation(["common", "dashboard"]);

  const { config } = useMiningControls();
  const telemetry = useMiningStats(config.cpuThreads);
  const foundBlocks = useMiningStore((s) => s.foundBlocks);
  const historyFilter = useAppStore((s) => s.historyFilter);
  const setHistoryFilter = useAppStore((s) => s.setHistoryFilter);

  const historyAddresses = resolveHistoryAddresses(historyFilter, accounts);
  const historyKey = historyAddresses.join(",");

  const [activity, setActivity] = useState<WalletActivity[]>([]);
  useEffect(() => {
    const addresses = historyKey.length > 0 ? historyKey.split(",") : [];
    if (addresses.length === 0) {
      setActivity([]);
      return;
    }

    const combinedKey = addresses.join(",");
    const cached = ActivityCacheService.getActivity(combinedKey);
    if (cached) {
      setActivity(cached);
    }

    const fetcher = (): Promise<WalletActivity[]> => getTransactions(addresses);
    const onData = (data: WalletActivity[]): void => setActivity(data);

    ActivityCacheService.startActivityPolling(
      combinedKey,
      fetcher,
      onData,
      ACTIVITY_POLL_INTERVAL_MS,
    );

    return () => {
      ActivityCacheService.stopActivityPolling(combinedKey);
    };
  }, [historyKey]);

  // Built every render: the dashboard tick keeps the ages current.
  const activityRows = activity.map((item) =>
    toActivityRow(item, t, i18n.language),
  );
  const activityPagination = usePagination(activityRows, ACTIVITY_PAGE_SIZE);

  const [, setCurrentTime] = useState<number>(Date.now());
  useEffect(() => {
    const tickInterval = setInterval(
      () => setCurrentTime(Date.now()),
      DASHBOARD_TICK_INTERVAL_MS,
    );
    return () => clearInterval(tickInterval);
  }, []);

  const scopedFoundBlocks = filterFoundBlocks(foundBlocks, historyAddresses);
  const minedBlocksCount = scopedFoundBlocks.filter((block) =>
    isWithinLastDay(block.timestamp),
  ).length;
  const blocksPastHour = scopedFoundBlocks.filter(
    (block) => Date.now() - block.timestamp * 1000 <= PAST_HOUR_MS,
  ).length;

  const sparklineData = Array(6).fill(0);
  if (isConnected) {
    const now = Date.now();
    const bucketSizeMs = SPARKLINE_BUCKET_MS;
    scopedFoundBlocks.forEach((block) => {
      const ageMs = now - block.timestamp * 1000;
      if (ageMs <= SPARKLINE_WINDOW_MS) {
        const bucketIndex = 5 - Math.floor(ageMs / bucketSizeMs);
        if (bucketIndex >= 0 && bucketIndex < 6) {
          sparklineData[bucketIndex]++;
        }
      }
    });

    const isFlat = sparklineData.every((val) => val === sparklineData[0]);
    if (isFlat) {
      const seed = difficulty !== null && difficulty > 0 ? difficulty % 10 : 3;
      for (let i = 0; i < 6; i++) {
        sparklineData[i] =
          sparklineData[0] + Math.floor(Math.abs(Math.sin(seed + i)) * 4);
      }
    }
  }

  const localHashrateLabel = isConnected
    ? `${formatMhs(telemetry.hashrateMhs)} MH/s`
    : "0.00 MH/s";

  const networkHashrateRaw =
    isConnected && difficulty !== null && difficulty > 0
      ? difficulty / TARGET_BLOCK_TIME_SECONDS
      : null;
  const networkHashrateDisplay = isConnected
    ? formatHashrate(networkHashrateRaw)
    : "0.00 H/s";

  const miningUptimeLabel =
    isConnected && telemetry.isMining
      ? t("dashboard:index.activelyMining")
      : t("dashboard:index.minerIdle");

  const difficultyDisplay = isConnected ? formatDifficulty(difficulty) : "--";
  const gasDisplay = isConnected && gasPriceGwei !== null ? gasPriceGwei : "0";
  const blockDisplay = isConnected ? formatBlockNumber(blockHeight) : "--";
  const peerDisplay =
    isConnected && peerCount !== null ? String(peerCount) : "--";

  const smartContractsCount = activeWalletAddress
    ? activity.filter(
        (tx) =>
          tx.from?.toLowerCase() === activeWalletAddress.toLowerCase() &&
          !tx.to,
      ).length
    : 0;

  const abbrAddress = activeWalletAddress
    ? `${activeWalletAddress.substring(0, 6)}...${activeWalletAddress.substring(activeWalletAddress.length - 4)}`
    : "--";

  const activeAccount = accounts.find(
    (account) =>
      account.address.toLowerCase() ===
      (activeWalletAddress ?? "").toLowerCase(),
  );
  const walletLabel = activeAccount?.label ?? t("common:sidebar.wallet");

  /**
   * Opens the wallet receive flow by priming the wallet modal state and routing
   * the user to the wallet view.
   */
  const handleReceive = (): void => {
    useWalletUiStore.getState().setModalState("RECEIVE");
    onNavigate("wallet");
  };

  /**
   * Opens the wallet send flow by priming the wallet modal state and routing the
   * user to the wallet view.
   */
  const handleSend = (): void => {
    useWalletUiStore.getState().setModalState("SEND");
    onNavigate("wallet");
  };

  /**
   * Routes the user to the explorer view to browse the full block history.
   */
  const handleViewAllBlocks = (): void => onNavigate("explorer");

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-slate-50/80 dark:bg-gray-950">
        <DashboardHeader
          isConnected={false}
          onReceive={handleReceive}
          onSend={handleSend}
        />
        <main className="flex-1 overflow-y-auto px-8 pb-8 space-y-5">
          <div className="grid grid-cols-[1.35fr_1fr] gap-5">
            <Skeleton className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 h-48" />
            <Skeleton className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 h-48" />
          </div>
          <div className="grid grid-cols-4 gap-5">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="grid grid-cols-2 gap-5 min-h-0">
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-800 flex items-center justify-between">
                <Skeleton className="w-24 h-5" />
                <Skeleton className="w-16 h-4" />
              </div>
              <SkeletonList itemCount={4} />
            </div>
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-800 flex items-center justify-between">
                <Skeleton className="w-32 h-5" />
                <Skeleton className="w-16 h-4" />
              </div>
              <SkeletonList itemCount={4} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50/80 dark:bg-gray-950">
      <DashboardHeader
        isConnected={isConnected}
        onReceive={handleReceive}
        onSend={handleSend}
      />

      <main className="flex-1 overflow-y-auto px-8 pb-8 space-y-5">
        <div className="grid grid-cols-[1.35fr_1fr] gap-5">
          <WalletOverviewCard
            balance={balance}
            abbrAddress={abbrAddress}
            activeWalletAddress={activeWalletAddress}
            walletLabel={walletLabel}
          />
          <NetworkHealthPanel
            isConnected={isConnected}
            blockDisplay={blockDisplay}
            peerDisplay={peerDisplay}
            difficultyDisplay={difficultyDisplay}
            gasDisplay={gasDisplay}
            blocksPastHour={blocksPastHour}
            sparklineData={sparklineData}
          />
        </div>

        <DashboardStatsGrid
          isConnected={isConnected}
          miningLabel={localHashrateLabel}
          miningUptimeLabel={miningUptimeLabel}
          minedBlocksCount={minedBlocksCount}
          hashrateDisplay={networkHashrateDisplay}
          smartContractsCount={smartContractsCount}
          onNavigate={onNavigate}
        />

        <div className="grid grid-cols-2 gap-5 min-h-0">
          <LatestBlocks
            isConnected={isConnected}
            recentBlocks={recentBlocks}
            activeWalletAddress={activeWalletAddress}
            onViewAll={handleViewAllBlocks}
          />
          <ActivityFeed
            isConnected={isConnected}
            activity={activityRows}
            pageItems={activityPagination.pageItems}
            currentPage={activityPagination.currentPage}
            totalPages={activityPagination.totalPages}
            onPageChange={activityPagination.setPage}
            accounts={accounts}
            historyFilter={historyFilter}
            onFilterChange={setHistoryFilter}
          />
        </div>
      </main>
    </div>
  );
}

export { DashboardPage };
