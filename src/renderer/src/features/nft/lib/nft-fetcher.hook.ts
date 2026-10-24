import i18next from "i18next";
import { useState, useEffect, useRef, useCallback } from "react";
import ms from "ms";
import {
  discoverUserNFTs,
  resolveNFTMetadata,
  buildProvider,
  readNFTCache,
  writeNFTCache,
  type NFTMetadata,
} from "../api/nft.service";

const POLL_INTERVAL_MS = ms("30s");

interface NFTFetcherState {
  nfts: NFTMetadata[];
  isFetching: boolean;
  error: string | null;
}

interface NFTFetcherResult extends NFTFetcherState {
  refresh: () => void;
}

/**
 * Runs an incremental NFT discovery scan for the given wallet address and merges
 * the result with the existing localStorage cache. Tokens received in the new
 * block range are appended; tokens that were transferred out in the same range
 * are removed. When the node reports no new blocks the existing cache is returned
 * unchanged, preventing the UI from going blank on a no-new-blocks poll.
 * @param {string} walletAddress - The wallet address to scan for owned NFTs.
 * @param {AbortSignal} signal - An abort signal that cancels the operation mid-flight.
 * @returns {Promise<NFTMetadata[]>} The fully merged and resolved NFT metadata array.
 */
async function runDiscovery(
  walletAddress: string,
  signal: AbortSignal,
): Promise<NFTMetadata[]> {
  const existingCache = readNFTCache(walletAddress);

  const scanResult = await discoverUserNFTs(walletAddress);

  if (signal.aborted) return existingCache;

  if (scanResult.earlyStopped) {
    return existingCache;
  }

  const { newTokens, outboundKeys } = scanResult;

  const existingFiltered = existingCache.filter((nft) => {
    const key = `${nft.contractAddress.toLowerCase()}:${nft.tokenId}`;
    return !outboundKeys.has(key);
  });

  const existingKeys = new Set(
    existingFiltered.map(
      (nft) => `${nft.contractAddress.toLowerCase()}:${nft.tokenId}`,
    ),
  );

  const genuinelyNew = newTokens.filter((token) => {
    const key = `${token.contractAddress.toLowerCase()}:${token.tokenId}`;
    return !existingKeys.has(key);
  });

  if (genuinelyNew.length === 0) {
    writeNFTCache(walletAddress, existingFiltered);
    return existingFiltered;
  }

  if (signal.aborted) return existingFiltered;

  const provider = await buildProvider();

  if (signal.aborted) return existingFiltered;

  const settled = await Promise.allSettled(
    genuinelyNew.map((token) =>
      resolveNFTMetadata(
        token.contractAddress,
        token.tokenId,
        token.standard,
        provider,
      ),
    ),
  );

  if (signal.aborted) return existingFiltered;

  const resolvedNew: NFTMetadata[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      resolvedNew.push(result.value);
    }
  }

  const merged = [...existingFiltered, ...resolvedNew];
  writeNFTCache(walletAddress, merged);
  return merged;
}

/**
 * Custom hook that discovers and resolves NFT metadata for a given wallet address.
 * On mount it immediately seeds the UI from the localStorage cache so the grid
 * appears instantly after a page refresh. A background discovery run then
 * reconciles the cache with the chain. Subsequent background polls are triggered
 * every 30 seconds so the list stays up to date without a manual refresh.
 * A refresh function is exposed so the NFT tab can manually trigger a re-scan at any time.
 * @param {string | null} walletAddress - The currently active wallet address, or null when not connected.
 * @returns {NFTFetcherResult} The current fetching state and a function to trigger a manual refresh.
 */
function useNFTFetcher(walletAddress: string | null): NFTFetcherResult {
  const [state, setState] = useState<NFTFetcherState>(() => {
    const cached = walletAddress ? readNFTCache(walletAddress) : [];
    return { nfts: cached, isFetching: false, error: null };
  });

  const abortRef = useRef<AbortController | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /**
   * Increments the refresh key to cancel any in-flight scan and start a new one immediately.
   * @returns {void}
   */
  const refresh = useCallback((): void => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!walletAddress) {
      setState({ nfts: [], isFetching: false, error: null });
      return;
    }

    const cached = readNFTCache(walletAddress);
    setState({ nfts: cached, isFetching: true, error: null });

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async (silent: boolean): Promise<void> => {
      if (!silent) {
        setState((prev) => ({ ...prev, isFetching: true, error: null }));
      }
      try {
        const resolved = await runDiscovery(walletAddress, controller.signal);
        if (controller.signal.aborted) return;
        setState({ nfts: resolved, isFetching: false, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error
            ? err.message
            : i18next.t("walletTabs:nft.discoveryFailed");
        console.error("[useNFTFetcher]", message);
        setState((prev) => ({ ...prev, isFetching: false, error: message }));
      }
    };

    run(false);

    const pollId = setInterval(() => {
      run(true);
    }, POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      clearInterval(pollId);
    };
  }, [walletAddress, refreshKey]);

  return { ...state, refresh };
}

export { useNFTFetcher };
export type { NFTFetcherResult };
