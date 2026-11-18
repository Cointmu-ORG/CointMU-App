import i18next from "i18next";
import type { DetectedNfts } from "@bridge/types";
import { createNodeProvider } from "@/shared/api";

const ERC721_ABI_FRAGMENTS = [
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function name() view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

const ERC1155_ABI_FRAGMENTS = [
  "function uri(uint256 tokenId) view returns (string)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
];

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

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
 * Normalizes an IPFS, ar://, or plain HTTP URI into a resolvable HTTP URL.
 * @param {string} uri - The raw URI from the contract's tokenURI response.
 * @returns {string} A fully qualified HTTP URL.
 */
function normalizeUri(uri: string): string {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    return uri.replace("ipfs://", IPFS_GATEWAY);
  }
  return uri;
}

/**
 * Fetches and parses JSON metadata for a single NFT token by calling tokenURI or
 * uri on the contract and resolving the returned URI to its HTTP equivalent.
 * Falls back gracefully when the contract does not implement the expected method
 * or when the metadata endpoint is unreachable.
 * @param {string} contractAddress - The NFT contract address.
 * @param {string} tokenId - The decimal token ID string.
 * @param {'ERC-721' | 'ERC-1155'} standard - The token standard.
 * @param {import('ethers').JsonRpcApiProvider} provider - The ethers provider instance.
 * @returns {Promise<NFTMetadata>} The resolved metadata, with fallback values for missing fields.
 */
export async function resolveNFTMetadata(
  contractAddress: string,
  tokenId: string,
  standard: "ERC-721" | "ERC-1155",
  provider: import("ethers").JsonRpcApiProvider,
): Promise<NFTMetadata> {
  const { ethers } = await import("ethers");

  const abi =
    standard === "ERC-721" ? ERC721_ABI_FRAGMENTS : ERC1155_ABI_FRAGMENTS;
  const contract = new ethers.Contract(contractAddress, abi, provider);

  let collectionName = i18next.t("walletTabs:nft.unknownCollection");
  let tokenUri = "";

  try {
    if (standard === "ERC-721") {
      collectionName = await contract.name();
    }
  } catch {
    // name() is optional
  }

  try {
    const bigTokenId = BigInt(tokenId);
    tokenUri =
      standard === "ERC-721"
        ? await contract.tokenURI(bigTokenId)
        : await contract.uri(bigTokenId);
  } catch {
    // tokenURI/uri call failed — return fallback
  }

  const resolvedUri = normalizeUri(tokenUri);

  let name = i18next.t("walletTabs:nft.fallbackName", { id: tokenId });
  let description = "";
  let image = "";

  if (resolvedUri) {
    try {
      const response = await fetch(resolvedUri);
      if (response.ok) {
        const json = await response.json();
        name = json.name || name;
        description = json.description || "";
        image = normalizeUri(json.image || "");
      }
    } catch {
      // Metadata fetch failed — use fallbacks
    }
  }

  return {
    contractAddress,
    tokenId,
    name,
    description,
    image,
    standard,
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
