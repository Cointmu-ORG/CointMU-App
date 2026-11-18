import { create } from "zustand";
import {
  fetchBlockNumber,
  fetchPeerCount,
  fetchGasPrice,
  fetchMiningStatus,
  fetchHashrate,
  fetchDifficulty,
  fetchBalance,
  formatBalance,
} from "@/shared/api/rpc.client";

const DISCONNECTED_BALANCE = "0.00";

const HISTORY_FILTER_ALL = "ALL";

type HistoryFilter = typeof HISTORY_FILTER_ALL | string;

interface PendingTransaction {
  hash: string;
  from: string;
  to: string;
  amount: number;
  /** Set for an ERC-20 send; amount is then in this token. */
  token?: { address: string; symbol: string };
  timestamp: number;
  gas: number;
}

interface AppState {
  blockHeight: number | null;
  peerCount: number | null;
  gasPriceGwei: string | null;
  isMining: boolean | null;
  hashrate: number | null;
  difficulty: number | null;
  isConnected: boolean;
  loading: boolean;
  activeAccount: string | null;
  balance: string;
  balances: Record<string, string>;
  pendingTransactions: PendingTransaction[];
  historyFilter: HistoryFilter;
  setActiveAccount: (address: string | null) => void;
  addPendingTransaction: (tx: PendingTransaction) => void;
  removePendingTransaction: (hash: string) => void;
  setHistoryFilter: (filter: HistoryFilter) => void;
  fetchGlobalStats: (
    address: string | null,
    addresses: string[],
  ) => Promise<void>;
}

/**
 * Builds the balances map for a set of addresses, mapping every address to the
 * disconnected placeholder. Used to keep the balances map shape stable while the
 * node is unreachable.
 * @param {string[]} addresses - The wallet addresses currently tracked by the application.
 * @returns {Record<string, string>} A record mapping each address to the disconnected balance string.
 */
function buildEmptyBalances(addresses: string[]): Record<string, string> {
  return addresses.reduce<Record<string, string>>((acc, addr) => {
    acc[addr] = DISCONNECTED_BALANCE;
    return acc;
  }, {});
}

/**
 * Single source of truth for all network and wallet data that is shared across
 * the Dashboard, Miner, Explorer, Wallet, and Settings views. A single polling
 * loop in the App orchestrator drives fetchGlobalStats, so every view renders
 * from the exact same snapshot and the per-view data drift described in Issue #8
 * is eliminated. Values are null while unknown or when the node is unreachable,
 * mirroring the disconnected semantics of the former per-view hooks.
 */
export const useAppStore = create<AppState>((set, get) => ({
  blockHeight: null,
  peerCount: null,
  gasPriceGwei: null,
  isMining: null,
  hashrate: null,
  difficulty: null,
  isConnected: false,
  loading: true,
  activeAccount: null,
  balance: DISCONNECTED_BALANCE,
  balances: {},
  pendingTransactions: [],
  historyFilter: HISTORY_FILTER_ALL,
  setActiveAccount: (address: string | null) => set({ activeAccount: address }),
  addPendingTransaction: (tx: PendingTransaction) =>
    set((state) => ({
      pendingTransactions: [...state.pendingTransactions, tx],
    })),
  removePendingTransaction: (hash: string) =>
    set((state) => ({
      pendingTransactions: state.pendingTransactions.filter(
        (tx) => tx.hash !== hash,
      ),
    })),
  setHistoryFilter: (filter: HistoryFilter) => set({ historyFilter: filter }),
  fetchGlobalStats: async (address: string | null, addresses: string[]) => {
    try {
      const blockResult = await fetchBlockNumber();

      if (blockResult === null) {
        set({
          blockHeight: null,
          peerCount: null,
          gasPriceGwei: null,
          isMining: null,
          hashrate: null,
          difficulty: null,
          isConnected: false,
          loading: false,
          balance: DISCONNECTED_BALANCE,
          balances: buildEmptyBalances(addresses),
        });
        return;
      }

      const [peers, gas, mining, hash, diff, singleBalance, balanceEntries] =
        await Promise.all([
          fetchPeerCount(),
          fetchGasPrice(),
          fetchMiningStatus(),
          fetchHashrate(),
          fetchDifficulty(),
          address !== null ? fetchBalance(address) : Promise.resolve(null),
          Promise.all(
            addresses.map(async (addr) => {
              const res = await fetchBalance(addr);
              return [addr, res !== null ? res : DISCONNECTED_BALANCE] as const;
            }),
          ),
        ]);

      const balances = balanceEntries.reduce<Record<string, string>>(
        (acc, [addr, value]) => {
          acc[addr] = value;
          return acc;
        },
        {},
      );

      let displayBalance =
        singleBalance !== null ? singleBalance : DISCONNECTED_BALANCE;

      const pendingByAddress = get().pendingTransactions.reduce<
        Record<string, number>
      >((acc, tx) => {
        acc[tx.from] = (acc[tx.from] ?? 0) + tx.amount + tx.gas;
        return acc;
      }, {});

      const applyPending = (formatted: string, addr: string): string => {
        const total = pendingByAddress[addr];
        if (!total) return formatted;
        const numeric = parseFloat(formatted.replace(/,/g, "")) - total;
        return formatBalance(numeric < 0 ? 0 : numeric);
      };

      Object.keys(balances).forEach((addr) => {
        balances[addr] = applyPending(balances[addr], addr);
      });

      if (address !== null) {
        displayBalance = applyPending(displayBalance, address);
      }

      set({
        blockHeight: blockResult,
        peerCount: peers,
        gasPriceGwei: gas,
        isMining: mining,
        hashrate: hash,
        difficulty: diff,
        isConnected: true,
        loading: false,
        balance: displayBalance,
        balances,
      });
    } catch {
      set({
        blockHeight: null,
        peerCount: null,
        gasPriceGwei: null,
        isMining: null,
        hashrate: null,
        difficulty: null,
        isConnected: false,
        loading: false,
        balance: DISCONNECTED_BALANCE,
        balances: buildEmptyBalances(addresses),
      });
    }
  },
}));

export { HISTORY_FILTER_ALL };
export type { AppState, HistoryFilter, PendingTransaction };
