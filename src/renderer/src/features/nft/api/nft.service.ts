import i18next from "i18next";
import type { DetectedNfts } from "@bridge/types";
import { createNodeProvider } from "@/shared/api";

const ERC721_NAME_ABI = ["function name() view returns (string)"];

// Keys of the renderer scan that the main-process scanner replaced.
const LEGACY_STORAGE_PREFIXES = ["cmu_nft_scan_block_", "cmu_nft_cache_"];

/**
 * @param account - A wallet account address.
 * @returns The ERC-721 tokens the main-process scan confirmed the account owns.
 */
export function getDetectedNfts(account: string): Promise<DetectedNfts> {
  return window.api.tokens.getDetectedNfts(account);
}

/**
 * Calls back after the background scan saw a new head or changed detections.
 * @returns Unsubscribe.
 */
export function onDetectedNftsChanged(callback: () => void): () => void {
  return window.api.tokens.onChanged(callback);
}

/** Removes the scan cursor and NFT cache the renderer scan kept in localStorage. */
export function dropLegacyNftStorage(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (LEGACY_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
  } catch (err) {
    console.warn("[NFTService] Could not clear the legacy NFT cache", err);
  }
}

export interface NFTMetadata {
  contractAddress: string;
  tokenId: string;
  name: string;
  description: string;
  image: string;
  standard: "ERC-721" | "ERC-1155";
  collectionName?: string;
}

/**
 * Resolves an NFT's display data. Main reads tokenURI on-chain and fetches
 * the metadata and image for a detected NFT of the account, so the renderer
 * never passes a URL or contacts a metadata host. Missing parts fall back.
 * @param account - The wallet account that owns the NFT.
 * @param contractAddress - The ERC-721 contract.
 * @param tokenId - The decimal token id.
 * @param provider - Reads the collection name.
 * @returns The metadata, with fallback values for missing fields.
 */
export async function resolveNFTMetadata(
  account: string,
  contractAddress: string,
  tokenId: string,
  provider: import("ethers").JsonRpcApiProvider,
): Promise<NFTMetadata> {
  const { ethers } = await import("ethers");
  const contract = new ethers.Contract(
    contractAddress,
    ERC721_NAME_ABI,
    provider,
  );

  let collectionName = i18next.t("walletTabs:nft.unknownCollection");
  try {
    collectionName = await contract.name();
  } catch {
    // name() is optional
  }

  let name = i18next.t("walletTabs:nft.fallbackName", { id: tokenId });
  let description = "";
  let image = "";
  try {
    const media = await window.api.tokens.fetchNftMedia(
      account,
      contractAddress,
      tokenId,
    );
    name = media.name || name;
    description = media.description;
    image = media.image;
  } catch (err) {
    console.warn("[NFTService] Metadata not loaded", err);
  }

  return {
    contractAddress,
    tokenId,
    name,
    description,
    image,
    standard: "ERC-721",
    collectionName,
  };
}

/**
 * Builds an ethers provider connected to the local Core-geth node through the
 * main process.
 * @returns {Promise<import('ethers').JsonRpcApiProvider>} A configured provider instance.
 */
export async function buildProvider(): Promise<
  import("ethers").JsonRpcApiProvider
> {
  return createNodeProvider();
}
