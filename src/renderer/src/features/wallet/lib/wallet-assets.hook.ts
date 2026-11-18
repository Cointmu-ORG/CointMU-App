import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DetectedToken, TokenScanProgress } from "@bridge/types";
import {
  getDetectedTokens,
  onDetectedTokensChanged,
} from "../api/detected-token.service";
import { TokenService, getTokenBalanceRaw } from "../api/token.service";
import { useHiddenTokensStore } from "../model/hidden-tokens.store";
import type { WalletAsset } from "../model/wallet-asset.types";
import {
  mergeWalletAssets,
  type WalletAssetSources,
} from "./wallet-assets.util";

interface Balances {
  /** The account these balances belong to. */
  readonly account: string;
  readonly nativeBalance: bigint;
  readonly manual: WalletAssetSources["manual"];
}

interface WalletAssetsResult {
  readonly assets: WalletAsset[];
  readonly scan: TokenScanProgress | null;
  readonly isLoading: boolean;
  /** Re-reads manual tokens and balances, e.g. after adding a token. */
  readonly refresh: () => void;
}

async function readBalances(account: string): Promise<Balances> {
  const tokens = TokenService.getTokens().filter((t) => t.address !== "native");
  const [nativeBalance, ...manualBalances] = await Promise.all([
    getTokenBalanceRaw(account, "native"),
    ...tokens.map((token) => getTokenBalanceRaw(account, token.address)),
  ]);
  return {
    account,
    nativeBalance,
    manual: tokens.map((token, i) => ({ token, balance: manualBalances[i] })),
  };
}

/**
 * CMU, manual and auto-detected tokens of one account, minus hidden ones.
 * Detected tokens come from the main-process scan; CMU and manual balances
 * are re-read only when the scan reports a new head, never on a timer.
 * @param account - The active account, or null.
 * @returns The merged assets, the scan progress and a refresh function.
 */
export function useWalletAssets(account: string | null): WalletAssetsResult {
  const [balances, setBalances] = useState<Balances | null>(null);
  const [detected, setDetected] = useState<readonly DetectedToken[]>([]);
  const [scan, setScan] = useState<TokenScanProgress | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const hidden = useHiddenTokensStore((s) => s.hidden);
  const lastHead = useRef<number | null>(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!account) return;
    let isActive = true;
    const loadBalances = (): void => {
      void readBalances(account).then((read) => {
        if (isActive) setBalances(read);
      });
    };
    const loadDetected = async (): Promise<void> => {
      try {
        const result = await getDetectedTokens(account);
        if (!isActive) return;
        setDetected(result.tokens);
        setScan(result.scan);
        if (result.scan.headBlock !== lastHead.current) {
          lastHead.current = result.scan.headBlock;
          loadBalances();
        }
      } catch (err) {
        console.error("Failed to read detected tokens", err);
      }
    };
    lastHead.current = null;
    loadBalances();
    void loadDetected();
    const unsubscribe = onDetectedTokensChanged(() => void loadDetected());
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [account, refreshKey]);

  const current = balances?.account === account ? balances : null;
  const assets = useMemo(
    () =>
      current === null
        ? []
        : mergeWalletAssets({
            ...current,
            detected,
            hidden: new Set(hidden.map((h) => h.address)),
          }),
    [current, detected, hidden],
  );

  return { assets, scan, isLoading: current === null, refresh };
}
