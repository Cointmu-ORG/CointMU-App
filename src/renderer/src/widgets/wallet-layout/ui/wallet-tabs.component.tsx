import {
  getTransactions,
  shortenAddress,
  toActivityRow,
} from "@/entities/transaction";
import { type JSX, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ActivityItem, type ActivityData } from "@/shared/ui";
import { ActivityKind, type WalletActivity } from "@bridge/types";
import {
  ActivityCacheService,
  AddTokenModal,
  TokenDetailModal,
  TokenList,
  useHiddenTokensStore,
  useWalletAssets,
  type WalletAsset,
} from "@/features/wallet";
import { SkeletonList, Pagination } from "@/shared/ui";
import { formatDateTime } from "@/shared/lib";
import { NFTGrid } from "@/features/nft";
import { Zap, Plus } from "lucide-react";
import { useAppStore, type PendingTransaction } from "@/shared/model";
import { useNFTFetcher } from "@/features/nft";

export type WalletTab = "activity" | "tokens" | "nfts";

const WALLET_TABS: Array<{ id: WalletTab; label: string }> = [
  { id: "activity", label: "Activity" },
  { id: "tokens", label: "Tokens" },
  { id: "nfts", label: "NFTs" },
];

interface WalletTabsProps {
  activeWalletAddress: string | null;
  activeTab: WalletTab;
  onTabChange: (tab: WalletTab) => void;
}

/**
 * Shortens an Ethereum address for compact display in pending activity rows.
 * @param address - The full 0x-prefixed address.
 * @returns The truncated address (first six and last four characters).
 */
/**
 * Maps an in-flight pending transaction from the global store into the
 * ActivityData shape so it can render alongside confirmed history rows.
 * @param tx - The pending transaction record.
 * @param t - Translator for the row labels.
 * @param locale - Language tag for the timestamp.
 * @returns The activity row representation flagged as pending.
 */
function mapPendingToActivity(
  tx: PendingTransaction,
  t: TFunction,
  locale: string,
): ActivityData {
  return {
    id: tx.hash,
    kind: ActivityKind.SEND,
    type: "send",
    title: tx.token
      ? t("common:activity.sentToken", { symbol: tx.token.symbol })
      : t("common:activity.sentCmu"),
    subtitle: t("common:activity.to", { address: shortenAddress(tx.to) }),
    amount: tx.amount.toLocaleString("en-US", { maximumFractionDigits: 4 }),
    timestamp: tx.timestamp,
    timestampStr: formatDateTime(tx.timestamp, locale),
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    token: tx.token,
    pending: true,
  };
}

/**
 * Filters a raw list of activity records so that only entries belonging to the
 * given wallet address are retained. Standard transactions are kept when either
 * the sender or recipient matches. Mining rewards are kept when the `to` field
 * (set to `block.miner` by the IPC handler) matches. All comparisons are
 * case-insensitive.
 * @param activities - The raw activity array returned by the IPC handler.
 * @param walletAddress - The active wallet address to filter against.
 * @returns A new array containing only activities that belong to the address.
 */
function filterActivitiesForAddress(
  activities: WalletActivity[],
  walletAddress: string,
): WalletActivity[] {
  const target = walletAddress.toLowerCase();
  return activities.filter((activity) => {
    if (activity.kind === ActivityKind.MINING_REWARD) {
      return activity.to?.toLowerCase() === target;
    }
    return (
      activity.from?.toLowerCase() === target ||
      activity.to?.toLowerCase() === target
    );
  });
}

/**
 * Tabbed content area for the wallet view, switching between transaction
 * activity, ERC-20 tokens, and NFTs. Includes a modal-gated flow for adding
 * custom ERC-20 tokens. The native CMU coin is always shown first and its
 * balance is fetched via the native provider method, not an ERC-20 contract.
 * @param props - The active wallet address, active tab, and tab change handler.
 * @returns The rendered tabbed content area.
 */
function WalletTabs({
  activeWalletAddress,
  activeTab,
  onTabChange,
}: WalletTabsProps): JSX.Element {
  const [transactions, setTransactions] = useState<WalletActivity[]>([]);
  const [isFetchingActivity, setIsFetchingActivity] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);
  const walletAssets = useWalletAssets(
    activeTab === "tokens" ? activeWalletAddress : null,
  );
  const hideToken = useHiddenTokensStore((s) => s.hide);
  const [isAddTokenModalOpen, setIsAddTokenModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pendingTransactions = useAppStore((s) => s.pendingTransactions);
  const nftFetcher = useNFTFetcher(
    activeTab === "nfts" ? activeWalletAddress : null,
  );
  const { t, i18n } = useTranslation();

  const pendingActivities = pendingTransactions
    .filter((tx) => tx.from === activeWalletAddress)
    .map((tx) => mapPendingToActivity(tx, t, i18n.language));
  const activities = [
    ...pendingActivities,
    ...transactions.map((tx) => toActivityRow(tx, t, i18n.language)),
  ];

  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(activities.length / itemsPerPage));
  const paginatedActivities = activities.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    if (!activeWalletAddress) return;
    const cached = ActivityCacheService.getActivity(activeWalletAddress);
    if (cached) {
      setTransactions(cached);
      setIsFetchingActivity(false);
    } else {
      setTransactions([]);
      setIsFetchingActivity(true);
    }

    getTransactions([activeWalletAddress]).then((results) => {
      const filtered = filterActivitiesForAddress(results, activeWalletAddress);
      setTransactions(filtered);
      ActivityCacheService.setActivity(activeWalletAddress, filtered);
      setIsFetchingActivity(false);
    });
    // A send leaving the pending list has been mined: refetch so it shows.
  }, [activeWalletAddress, pendingTransactions.length]);

  const handleTokenAdded = walletAssets.refresh;

  const handleHide = (asset: WalletAsset): void => {
    hideToken(asset);
    setSelectedAsset(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center rounded-lg border border-slate-200 dark:border-gray-800 overflow-hidden bg-slate-100/50 dark:bg-gray-950">
          {WALLET_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-2 text-xs font-semibold transition-all duration-150 ${
                activeTab === tab.id
                  ? "bg-white dark:bg-gray-800 text-slate-800 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-gray-300"
              }`}
            >
              {t(`walletTabs:${tab.id}`)}
            </button>
          ))}
        </div>

        {activeTab === "tokens" && (
          <button
            type="button"
            onClick={() => setIsAddTokenModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-gray-200 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 hover:border-slate-300 dark:hover:border-gray-600 transition-all duration-150 shadow-sm"
          >
            <Plus width={12} height={12} strokeWidth={2.5} />
            {t("walletTabs:addToken")}
          </button>
        )}
        {activeTab === "nfts" && (
          <button
            type="button"
            onClick={nftFetcher.refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-gray-200 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 hover:border-slate-300 dark:hover:border-gray-600 transition-all duration-150 shadow-sm"
          >
            {t("walletTabs:refresh")}
          </button>
        )}
      </div>

      {activeTab === "activity" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 divide-y divide-slate-100 dark:divide-gray-800 overflow-hidden text-slate-800 dark:text-gray-100">
            {isFetchingActivity ? (
              <SkeletonList itemCount={5} />
            ) : paginatedActivities.length > 0 ? (
              paginatedActivities.map((tx) => (
                <ActivityItem key={tx.id} activity={tx} />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Zap
                  className="text-slate-300 dark:text-gray-600 mb-3"
                  width={32}
                  height={32}
                  strokeWidth={1.5}
                />
                <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
                  {t("walletTabs:noActivity")}
                </p>
                <p className="text-xs text-slate-400 dark:text-gray-400 mt-1">
                  {t("walletTabs:noActivityHint")}
                </p>
              </div>
            )}
          </div>
          {totalPages > 1 && (
            <div className="px-1">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === "tokens" && (
        <TokenList
          assets={walletAssets.assets}
          scan={walletAssets.scan}
          isLoading={walletAssets.isLoading}
          onSelect={setSelectedAsset}
          onHide={handleHide}
        />
      )}

      {activeTab === "nfts" && (
        <div>
          {nftFetcher.isFetching ? (
            <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
                  {t("walletTabs:scanningNfts")}
                </p>
              </div>
            </div>
          ) : nftFetcher.nfts.length > 0 ? (
            <NFTGrid nfts={nftFetcher.nfts} />
          ) : (
            <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm font-medium text-slate-400 dark:text-gray-400">
                  {t("walletTabs:noNftsFound")}
                </p>
                {nftFetcher.error && (
                  <p className="text-xs text-red-400 mt-1">
                    {nftFetcher.error}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedAsset && (
        <TokenDetailModal
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onHide={handleHide}
        />
      )}

      {isAddTokenModalOpen && (
        <AddTokenModal
          onClose={() => setIsAddTokenModalOpen(false)}
          onTokenAdded={handleTokenAdded}
        />
      )}
    </div>
  );
}

export { WalletTabs };
export type { WalletTabsProps };
