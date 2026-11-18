import i18next from "i18next";
import { useState, useEffect, useRef, useCallback } from "react";
import type { DetectedNft } from "@bridge/types";
import {
  buildProvider,
  dropLegacyNftStorage,
  getDetectedNfts,
  onDetectedNftsChanged,
  resolveNFTMetadata,
  type NFTMetadata,
} from "../api/nft.service";

interface LoadedNfts {
  /** The account these NFTs belong to; null before the first load. */
  address: string | null;
  nfts: NFTMetadata[];
  error: string | null;
}

interface NFTFetcherResult {
  nfts: NFTMetadata[];
  isFetching: boolean;
  error: string | null;
  refresh: () => void;
}

const keyOf = (nft: DetectedNft): string => `${nft.contract}:${nft.tokenId}`;

dropLegacyNftStorage();

/**
 * Resolves metadata for the NFTs not in the cache yet and adds them to it.
 * A token whose metadata cannot be resolved is left out and retried next time.
 */
async function resolveMissing(
  nfts: readonly DetectedNft[],
  cache: Map<string, NFTMetadata>,
): Promise<void> {
  const missing = nfts.filter((nft) => !cache.has(keyOf(nft)));
  if (missing.length === 0) return;
  const provider = await buildProvider();
  const settled = await Promise.allSettled(
    missing.map((nft) =>
      resolveNFTMetadata(nft.contract, nft.tokenId, "ERC-721", provider),
    ),
  );
  settled.forEach((result, i) => {
    if (result.status === "fulfilled")
      cache.set(keyOf(missing[i]), result.value);
  });
}

/**
 * The NFTs the main-process token scan confirmed the account owns, with their
 * metadata. Reloads when the scan reports a change (new head or detection);
 * metadata is resolved once per token and kept for the hook's lifetime.
 * @param walletAddress - The active wallet address, or null when the tab is hidden.
 * @returns The NFTs, loading and error state, and a manual refresh.
 */
function useNFTFetcher(walletAddress: string | null): NFTFetcherResult {
  const [loaded, setLoaded] = useState<LoadedNfts>({
    address: null,
    nfts: [],
    error: null,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const metadata = useRef(new Map<string, NFTMetadata>());

  const refresh = useCallback((): void => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!walletAddress) return;
    let isActive = true;
    const load = async (): Promise<void> => {
      try {
        const { nfts } = await getDetectedNfts(walletAddress);
        await resolveMissing(nfts, metadata.current);
        if (!isActive) return;
        setLoaded({
          address: walletAddress,
          nfts: nfts.flatMap((nft) => metadata.current.get(keyOf(nft)) ?? []),
          error: null,
        });
      } catch (err) {
        if (!isActive) return;
        console.error("[useNFTFetcher]", err);
        setLoaded((prev) => ({
          ...prev,
          address: walletAddress,
          error: i18next.t("walletTabs:nft.discoveryFailed"),
        }));
      }
    };
    void load();
    const unsubscribe = onDetectedNftsChanged(() => void load());
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [walletAddress, refreshKey]);

  const isCurrent = walletAddress !== null && loaded.address === walletAddress;
  return {
    nfts: isCurrent ? loaded.nfts : [],
    isFetching: walletAddress !== null && !isCurrent,
    error: isCurrent ? loaded.error : null,
    refresh,
  };
}

export { useNFTFetcher };
export type { NFTFetcherResult };
