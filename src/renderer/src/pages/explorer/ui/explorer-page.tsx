import {
  WEI_PER_CMU,
  BLOCK_REWARD_CMU,
  EXPLORER_TX_PAGE_SIZE,
  EMPTY_STAT_LABEL,
  INSIGHTS_POLL_INTERVAL_MS,
  EXPLORER_VIEW_TICK_INTERVAL_MS as TICK_INTERVAL_MS,
} from "@/features/explorer";
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type JSX,
  type SyntheticEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { usePagination, useRecentBlocks } from "@/shared/lib";

import { useAppStore } from "@/shared/model";
import { call, fetchBalance } from "@/shared/api";
import { getNetworkInsights } from "@/features/settings";
import { detectSearchType } from "@/features/explorer";
import { type DerivedAccount } from "@/features/wallet";
import { formatBlockNumber } from "@/shared/lib";
import { type ActivityData } from "@/shared/ui";
import { ActivityKind } from "@bridge/types";
import { Insights } from "@/features/explorer";
import { ChainTimeline } from "@/features/explorer";
import { Skeleton, SkeletonCard } from "@/shared/ui";
import { ExplorerHeader } from "@/features/explorer";
import { ExplorerSearch } from "@/features/explorer";
import { ExplorerDataTabs, type TabState } from "@/features/explorer";
import { BlockDetail } from "@/features/explorer";
import { TransactionDetail } from "@/features/explorer";
import { AddressDetail } from "@/features/explorer";

interface ExplorerProps {
  activeWalletAddress: string | null;
  accounts: DerivedAccount[];
}

type ViewState = "MAIN" | "BLOCK_DETAIL" | "TX_DETAIL" | "ADDRESS_DETAIL";

interface TopAccount {
  address: string;
  balance: number;
  percentage: number;
}

/**
 * Sums all genesis alloc balances (in Wei) and converts the total to a
 * floating-point CMU value. Uses BigInt to avoid precision loss on large
 * Wei strings that exceed Number.MAX_SAFE_INTEGER.
 * @param alloc - The genesis alloc map keyed by address.
 * @returns The total pre-mined supply expressed in CMU.
 */
function sumGenesisAllocCmu(
  alloc: Record<string, { balance: string }>,
): number {
  let totalWei = BigInt(0);
  for (const entry of Object.values(alloc)) {
    totalWei += BigInt(entry.balance);
  }
  const wholePart = totalWei / WEI_PER_CMU;
  const fractionalWei = totalWei % WEI_PER_CMU;
  return Number(wholePart) + Number(fractionalWei) / Number(WEI_PER_CMU);
}

/**
 * Explorer view orchestrator. It owns the network insights polling, search,
 * navigation, and account-loading logic, and composes the search, data tables,
 * and detail views from focused presentational sub-components.
 * @param props - The active wallet address used to flag and seed account data.
 * @returns The complete explorer interface.
 */
function ExplorerPage({
  activeWalletAddress,
  accounts,
}: ExplorerProps): JSX.Element {
  const { t } = useTranslation();
  const blockHeight = useAppStore((s) => s.blockHeight);
  const isConnected = useAppStore((s) => s.isConnected);

  const recentBlocks = useRecentBlocks(blockHeight, isConnected);

  const globalTransactions = useMemo(() => {
    const txs: ActivityData[] = [];
    recentBlocks.forEach((block) => {
      if (block.transactions && Array.isArray(block.transactions)) {
        block.transactions.forEach((tx) => {
          if (!tx || typeof tx !== "object") return;
          const amountCmu = (parseInt(tx.value, 16) / 1e18).toFixed(4);
          txs.push({
            id: tx.hash,
            kind: tx.to ? ActivityKind.SEND : ActivityKind.CONTRACT_DEPLOY,
            type: tx.to ? "send" : "contract",
            title: tx.to
              ? t("explorer:index.transaction")
              : t("explorer:index.contractCreation"),
            subtitle: "",
            amount: amountCmu,
            timestamp: block.timestamp,
            timestampStr: new Date(block.timestamp * 1000).toLocaleString(
              "en-US",
              {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              },
            ),
            blockNumber: block.number,
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
          });
        });
      }
    });
    return txs.sort((a, b) => b.timestamp - a.timestamp);
  }, [recentBlocks]);

  const txPagination = usePagination(globalTransactions, EXPLORER_TX_PAGE_SIZE);

  const [insights, setInsights] = useState<any>(null);

  useEffect(() => {
    if (!isConnected) return;
    let mounted = true;

    async function fetchInsights(): Promise<void> {
      try {
        const data = await getNetworkInsights();
        if (mounted && data) setInsights(data);
      } catch (err) {
        console.warn("Failed to fetch insights:", err);
      }
    }

    fetchInsights();
    const interval = setInterval(fetchInsights, INSIGHTS_POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isConnected]);

  const [, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(
      () => setCurrentTime(Date.now()),
      TICK_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, []);

  const [currentView, setCurrentView] = useState<ViewState>("MAIN");
  const [selectedBlock, setSelectedBlock] = useState<any | null>(null);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabState>("blocks");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchValue, setSearchValue] = useState("");

  const [topAccounts, setTopAccounts] = useState<TopAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [genesisAllocCmu, setGenesisAllocCmu] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    async function loadGenesisAlloc(): Promise<void> {
      try {
        const genesis = await window.api.network.getGenesisConfig();
        if (!mounted || !genesis || !genesis.alloc) return;
        setGenesisAllocCmu(sumGenesisAllocCmu(genesis.alloc));
      } catch (err) {
        console.warn("Failed to fetch genesis alloc:", err);
      }
    }
    loadGenesisAlloc();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleAddressSelect = (address: string): void => {
    setSelectedAddress(address);
    setCurrentView("ADDRESS_DETAIL");
    setSearchValue("");
  };

  const handleTxHashSelect = async (hash: string): Promise<void> => {
    const txData = await call("eth_getTransactionByHash", [hash]);
    if (txData) {
      setSelectedTx(txData);
      setCurrentView("TX_DETAIL");
      setSearchValue("");
    }
  };

  const handleSearch = async (e: SyntheticEvent): Promise<void> => {
    e.preventDefault();
    const val = searchValue.trim();
    const type = detectSearchType(val);
    if (type === null) return;

    if (type === "address") {
      handleAddressSelect(val);
      return;
    }

    let result: any = null;
    if (type === "block") {
      const hexValue = "0x" + Number(val).toString(16);
      result = await call("eth_getBlockByNumber", [hexValue, true]);
    } else if (type === "hash") {
      result = await call("eth_getBlockByHash", [val, true]);
      if (!result) {
        result = await call("eth_getTransactionByHash", [val]);
      }
    }

    if (result && result.number !== undefined) {
      setSelectedBlock(result);
      setCurrentView("BLOCK_DETAIL");
      setSearchValue("");
    } else if (result && result.blockHash) {
      setSelectedTx(result);
      setCurrentView("TX_DETAIL");
      setSearchValue("");
    }
  };

  const handleBlockSelect = async (blockNum: number): Promise<void> => {
    const hex = "0x" + blockNum.toString(16);
    const blockData = await call("eth_getBlockByNumber", [hex, true]);
    if (blockData && blockData.number !== undefined) {
      setSelectedBlock(blockData);
      setCurrentView("BLOCK_DETAIL");
    }
  };

  const handleTransactionSelect = (tx: any): void => {
    setSelectedTx(tx);
    setCurrentView("TX_DETAIL");
  };

  const handleTransactionBack = (): void => {
    if (selectedBlock && selectedBlock.number === selectedTx.blockNumber) {
      setCurrentView("BLOCK_DETAIL");
    } else {
      handleBlockSelect(parseInt(selectedTx.blockNumber, 16));
    }
  };

  useEffect(() => {
    async function loadAccounts(): Promise<void> {
      if (!isConnected || blockHeight === null) return;
      setIsLoadingAccounts(true);
      const addresses = new Set<string>();

      recentBlocks.forEach((b) => {
        if (b.miner) addresses.add(b.miner.toLowerCase());
        if (b.transactions && Array.isArray(b.transactions)) {
          b.transactions.forEach((tx) => {
            if (tx.from) addresses.add(tx.from.toLowerCase());
            if (tx.to) addresses.add(tx.to.toLowerCase());
          });
        }
      });

      const uniqueAddresses = Array.from(addresses);
      if (uniqueAddresses.length === 0) {
        setIsLoadingAccounts(false);
        return;
      }

      const balances = await Promise.all(
        uniqueAddresses.map(async (addr) => {
          const balStr = await fetchBalance(addr);
          const num = parseFloat(balStr?.replace(/,/g, "") || "0");
          return { address: addr, balance: isNaN(num) ? 0 : num };
        }),
      );

      balances.sort((a, b) => b.balance - a.balance);

      const minedSupply = (blockHeight ?? 0) * BLOCK_REWARD_CMU;
      const totalSupply = genesisAllocCmu + minedSupply;
      const accountsWithPercentage = balances.map((b) => ({
        ...b,
        percentage:
          totalSupply > 0 ? Math.min((b.balance / totalSupply) * 100, 100) : 0,
      }));

      setTopAccounts(accountsWithPercentage);
      setIsLoadingAccounts(false);
    }

    if (activeTab === "accounts") {
      loadAccounts();
    }
  }, [activeTab, recentBlocks, isConnected, blockHeight, genesisAllocCmu]);

  const networkHeight = isConnected
    ? formatBlockNumber(blockHeight)
    : EMPTY_STAT_LABEL;

  return (
    <div className="flex flex-col h-full bg-slate-50/80 dark:bg-gray-950 dark:text-white">
      <ExplorerHeader isConnected={isConnected} networkHeight={networkHeight} />

      <main className="flex-1 overflow-y-auto px-8 py-6">
        {currentView === "MAIN" ? (
          <div className="max-w-5xl mx-auto space-y-6">
            <ExplorerSearch
              searchValue={searchValue}
              searchInputRef={searchInputRef}
              onSearchValueChange={setSearchValue}
              onSubmit={handleSearch}
            />

            {!insights && isConnected ? (
              <>
                <div className="grid grid-cols-5 gap-4">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
                <Skeleton className="w-full h-32 rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800" />
              </>
            ) : (
              <>
                <Insights insights={insights} />
                <ChainTimeline
                  blocks={insights?.blocks || []}
                  coinbase={activeWalletAddress || insights?.coinbase || ""}
                  isOnline={insights?.isOnline ?? false}
                  onBlockClick={handleBlockSelect}
                />
              </>
            )}

            <ExplorerDataTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              isConnected={isConnected}
              recentBlocks={recentBlocks}
              topAccounts={topAccounts}
              isLoadingAccounts={isLoadingAccounts}
              activeWalletAddress={activeWalletAddress}
              onBlockSelect={handleBlockSelect}
              onAddressSelect={handleAddressSelect}
              onTxHashSelect={handleTxHashSelect}
              transactions={txPagination.pageItems}
              txCurrentPage={txPagination.currentPage}
              txTotalPages={txPagination.totalPages}
              onTxPageChange={txPagination.setPage}
            />
          </div>
        ) : currentView === "BLOCK_DETAIL" && selectedBlock ? (
          <BlockDetail
            block={selectedBlock}
            onBack={() => setCurrentView("MAIN")}
            onBlockSelect={handleBlockSelect}
            onTransactionSelect={handleTransactionSelect}
            onAddressSelect={handleAddressSelect}
          />
        ) : currentView === "TX_DETAIL" && selectedTx ? (
          <TransactionDetail
            tx={selectedTx}
            onBack={handleTransactionBack}
            onBlockSelect={handleBlockSelect}
            onAddressSelect={handleAddressSelect}
          />
        ) : currentView === "ADDRESS_DETAIL" && selectedAddress ? (
          <AddressDetail
            address={selectedAddress}
            accounts={accounts}
            onBack={() => setCurrentView("MAIN")}
            onAddressSelect={handleAddressSelect}
            onTxHashSelect={handleTxHashSelect}
          />
        ) : null}
      </main>
    </div>
  );
}

export { ExplorerPage };
