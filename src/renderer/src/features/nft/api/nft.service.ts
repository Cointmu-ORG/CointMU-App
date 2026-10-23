import { call, createNodeProvider } from "@/shared/api";

const ERC721_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const ERC1155_SINGLE_TRANSFER_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";

const ERC721_ABI_FRAGMENTS = [
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function name() view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

const ERC1155_ABI_FRAGMENTS = [
  "function uri(uint256 tokenId) view returns (string)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
];

const LAST_SCANNED_BLOCK_KEY_PREFIX = "cmu_nft_scan_block_";

const NFT_DISCOVERY_CHUNK_SIZE = 5000;

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

const NFT_CACHE_KEY_PREFIX = "cmu_nft_cache_";

/**
 * Reads the persisted NFT metadata array for a given wallet address from localStorage.
 * Returns an empty array when no cached data exists or when the stored value cannot be parsed.
 * @param {string} walletAddress - The wallet address used as part of the cache key.
 * @returns {NFTMetadata[]} The previously cached metadata array.
 */
export function readNFTCache(walletAddress: string): NFTMetadata[] {
  try {
    const stored = localStorage.getItem(
      NFT_CACHE_KEY_PREFIX + walletAddress.toLowerCase(),
    );
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed as NFTMetadata[];
      }
    }
  } catch {
    // Return empty array on parse error
  }
  return [];
}

/**
 * Writes the resolved NFT metadata array for a given wallet address to localStorage.
 * Silently ignores write errors so a storage quota failure never crashes the UI.
 * @param {string} walletAddress - The wallet address used as part of the cache key.
 * @param {NFTMetadata[]} nfts - The metadata array to persist.
 * @returns {void}
 */
export function writeNFTCache(
  walletAddress: string,
  nfts: NFTMetadata[],
): void {
  try {
    localStorage.setItem(
      NFT_CACHE_KEY_PREFIX + walletAddress.toLowerCase(),
      JSON.stringify(nfts),
    );
  } catch {
    // Ignore storage failures
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

interface RawTransferLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
}

interface DiscoveredToken {
  contractAddress: string;
  tokenId: string;
  standard: "ERC-721" | "ERC-1155";
}

/**
 * Holds the result of a single incremental log scan.
 * When earlyStopped is true the chain had no new blocks to scan and the
 * caller must not overwrite or replace the existing NFT cache.
 */
interface ScanResult {
  newTokens: DiscoveredToken[];
  outboundKeys: Set<string>;
  earlyStopped: boolean;
}

/**
 * Pads an Ethereum address to a 32-byte topic value as used by eth_getLogs filters.
 * @param {string} address - The 20-byte wallet address.
 * @returns {string} The zero-padded 32-byte topic string.
 */
function addressToTopic(address: string): string {
  return "0x000000000000000000000000" + address.replace("0x", "").toLowerCase();
}

/**
 * Safely converts a 32-byte topic hex value to a decimal token ID string.
 * Returns null when the value is absent, empty, or cannot be parsed as a BigInt,
 * allowing callers to silently skip malformed or ERC-20 log entries.
 * @param {string | undefined} topic - The 32-byte hex topic value, or undefined.
 * @returns {string | null} The token ID as a decimal string, or null on failure.
 */
function safeTopicToTokenId(topic: string | undefined): string | null {
  if (!topic || topic === "0x") return null;
  try {
    return BigInt(topic).toString(10);
  } catch {
    console.warn("[NFTService] Failed to parse topic as BigInt:", topic);
    return null;
  }
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
 * Retrieves the last scanned block number for a given wallet from localStorage.
 * Returns 0 when no scan has been performed, triggering a full-range scan.
 * @param {string} walletAddress - The wallet address used as part of the cache key.
 * @returns {number} The last scanned block number.
 */
function getLastScannedBlock(walletAddress: string): number {
  try {
    const stored = localStorage.getItem(
      LAST_SCANNED_BLOCK_KEY_PREFIX + walletAddress.toLowerCase(),
    );
    if (stored !== null) {
      return parseInt(stored, 10);
    }
  } catch {
    // Return 0 on any storage error
  }
  return 0;
}

/**
 * Persists the latest scanned block number to localStorage for a given wallet.
 * @param {string} walletAddress - The wallet address used as part of the cache key.
 * @param {number} blockNumber - The block number to persist.
 * @returns {void}
 */
function setLastScannedBlock(walletAddress: string, blockNumber: number): void {
  try {
    localStorage.setItem(
      LAST_SCANNED_BLOCK_KEY_PREFIX + walletAddress.toLowerCase(),
      String(blockNumber),
    );
  } catch {
    // Ignore storage failures
  }
}

/**
 * Fetches transfer logs for a single topic signature over a bounded block range
 * using eth_getLogs, targeting only the given recipient address.
 * @param {string} topic - The keccak256 event signature to filter on.
 * @param {string} recipientTopic - The zero-padded recipient address topic.
 * @param {string} fromBlock - The hex-encoded start block.
 * @param {string} toBlock - The hex-encoded end block.
 * @returns {Promise<RawTransferLog[]>} The matching raw log entries.
 */
async function fetchLogsForTopic(
  topic: string,
  recipientTopic: string,
  fromBlock: string,
  toBlock: string,
): Promise<RawTransferLog[]> {
  const result = await call("eth_getLogs", [
    {
      fromBlock,
      toBlock,
      topics: [topic, null, recipientTopic],
    },
  ]);
  if (!Array.isArray(result)) return [];
  return result as RawTransferLog[];
}

/**
 * Discovers NFTs owned by a wallet by scanning ERC-721 and ERC-1155 Transfer
 * event logs from the last cached block to the current chain head. Scanning is
 * performed in fixed-size block chunks to avoid node-imposed log response limits.
 * Returns only the tokens that were received in the scanned range alongside the
 * set of outbound transfer keys so the caller can perform a cache-aware merge.
 * When no new blocks have been minted since the last scan, earlyStopped is true
 * and newTokens is empty, signalling that the cache must not be replaced.
 * @param {string} walletAddress - The wallet address to discover NFTs for.
 * @returns {Promise<ScanResult>} The incremental scan result for the new block range.
 */
export async function discoverUserNFTs(
  walletAddress: string,
): Promise<ScanResult> {
  const currentBlockHex: string | null = await call("eth_blockNumber");
  if (!currentBlockHex)
    return { newTokens: [], outboundKeys: new Set(), earlyStopped: true };

  const currentBlock = parseInt(currentBlockHex, 16);
  const fromBlock = getLastScannedBlock(walletAddress);

  if (fromBlock >= currentBlock)
    return { newTokens: [], outboundKeys: new Set(), earlyStopped: true };

  const recipientTopic = addressToTopic(walletAddress);
  const senderTopic = addressToTopic(walletAddress);

  const inboundErc721: RawTransferLog[] = [];
  const outboundErc721: RawTransferLog[] = [];
  const inboundErc1155Single: RawTransferLog[] = [];
  const outboundErc1155Single: RawTransferLog[] = [];

  for (
    let start = fromBlock;
    start <= currentBlock;
    start += NFT_DISCOVERY_CHUNK_SIZE
  ) {
    const end = Math.min(start + NFT_DISCOVERY_CHUNK_SIZE - 1, currentBlock);
    const fromHex = "0x" + start.toString(16);
    const toHex = "0x" + end.toString(16);

    const [inErc721, outErc721, inErc1155, outErc1155] = await Promise.all([
      fetchLogsForTopic(ERC721_TRANSFER_TOPIC, recipientTopic, fromHex, toHex),
      call("eth_getLogs", [
        {
          fromBlock: fromHex,
          toBlock: toHex,
          topics: [ERC721_TRANSFER_TOPIC, senderTopic, null],
        },
      ]).then((r) => (Array.isArray(r) ? (r as RawTransferLog[]) : [])),
      fetchLogsForTopic(
        ERC1155_SINGLE_TRANSFER_TOPIC,
        recipientTopic,
        fromHex,
        toHex,
      ),
      call("eth_getLogs", [
        {
          fromBlock: fromHex,
          toBlock: toHex,
          topics: [ERC1155_SINGLE_TRANSFER_TOPIC, null, senderTopic],
        },
      ]).then((r) => (Array.isArray(r) ? (r as RawTransferLog[]) : [])),
    ]);

    inboundErc721.push(...inErc721);
    outboundErc721.push(...outErc721);
    inboundErc1155Single.push(...inErc1155);
    outboundErc1155Single.push(...outErc1155);
  }

  const outboundKeys = new Set<string>([
    ...outboundErc721
      .filter((log) => log.topics.length === 4)
      .flatMap((log) => {
        const tokenId = safeTopicToTokenId(log.topics[3]);
        return tokenId !== null
          ? [`${log.address.toLowerCase()}:${tokenId}`]
          : [];
      }),
    ...outboundErc1155Single
      .filter((log) => log.topics.length === 4)
      .flatMap((log) => {
        const tokenId = safeTopicToTokenId(log.topics[3]);
        return tokenId !== null
          ? [`${log.address.toLowerCase()}:${tokenId}`]
          : [];
      }),
  ]);

  const newTokens: DiscoveredToken[] = [];

  for (const log of inboundErc721) {
    if (log.topics.length !== 4) continue;
    const tokenId = safeTopicToTokenId(log.topics[3]);
    if (tokenId === null) continue;
    const key = `${log.address.toLowerCase()}:${tokenId}`;
    if (!outboundKeys.has(key)) {
      newTokens.push({
        contractAddress: log.address,
        tokenId,
        standard: "ERC-721",
      });
    }
  }

  for (const log of inboundErc1155Single) {
    if (log.topics.length !== 4) continue;
    const tokenId = safeTopicToTokenId(log.topics[3]);
    if (tokenId === null) continue;
    const key = `${log.address.toLowerCase()}:${tokenId}`;
    if (!outboundKeys.has(key)) {
      newTokens.push({
        contractAddress: log.address,
        tokenId,
        standard: "ERC-1155",
      });
    }
  }

  setLastScannedBlock(walletAddress, currentBlock);

  return { newTokens, outboundKeys, earlyStopped: false };
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

  let collectionName = "Unknown Collection";
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

  let name = `Token #${tokenId}`;
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
