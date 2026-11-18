import { Interface } from "ethers";
import type { DetectedNft } from "../../bridge/types";
import type { EthCall } from "./erc20Calls";

/** ERC-721 Transfer indexes the token id as a 4th topic. */
export const ERC721_TRANSFER_TOPIC_COUNT = 4;
/** NFTs kept per account; when full, a token no longer owned makes room. */
export const MAX_NFTS_PER_ACCOUNT = 500;
const TOKEN_ID_TOPIC = 3;
const KEY_SEPARATOR = ":";

const erc721 = new Interface([
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

/** NFTs seen in Transfer logs, by "contract:tokenId" (decimal), and whether the account owns each. */
export type NftOwnership = Record<string, boolean>;

/**
 * @param logs - Transfer logs to or from one account.
 * @returns "contract:tokenId" keys of the ERC-721 (4-topic) logs, lowercase contract.
 */
export function erc721Keys(
  logs: ReadonlyArray<{ address: string; topics: readonly string[] }>,
): string[] {
  return logs
    .filter((log) => log.topics.length === ERC721_TRANSFER_TOPIC_COUNT)
    .map(
      (log) =>
        log.address.toLowerCase() +
        KEY_SEPARATOR +
        BigInt(log.topics[TOKEN_ID_TOPIC]).toString(),
    );
}

/**
 * Adds keys not yet known, as not owned until ownerOf confirms. At the cap a
 * token not confirmed as owned (sent away, or not checked yet during catch-up)
 * is dropped to make room; with none, the key is ignored.
 * @returns The keys that are now tracked.
 */
export function trackNfts(
  nfts: NftOwnership,
  keys: readonly string[],
): string[] {
  return keys.filter((key) => {
    if (key in nfts) return true;
    if (Object.keys(nfts).length >= MAX_NFTS_PER_ACCOUNT) {
      const gone = Object.keys(nfts).find((known) => !nfts[known]);
      if (gone === undefined) return false;
      delete nfts[gone];
    }
    nfts[key] = false;
    return true;
  });
}

/**
 * Confirms ownership with ownerOf; a revert (burned, not ERC-721) means not owned.
 * @param call - The eth_call function.
 * @param account - The lowercase account.
 * @param keys - "contract:tokenId" keys to check.
 * @returns Ownership of each key.
 */
export async function readNftOwnership(
  call: EthCall,
  account: string,
  keys: readonly string[],
): Promise<NftOwnership> {
  const owners = await Promise.all(
    keys.map(async (key) => {
      const [contract, tokenId] = key.split(KEY_SEPARATOR);
      const result = await call(
        contract,
        erc721.encodeFunctionData("ownerOf", [tokenId]),
      );
      if (result === null || result === "0x") return null;
      try {
        return String(erc721.decodeFunctionResult("ownerOf", result)[0]);
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(
    keys.map((key, i) => [key, owners[i]?.toLowerCase() === account]),
  );
}

/** @returns The owned NFTs, in the order they were first seen. */
export function ownedNfts(nfts: NftOwnership): DetectedNft[] {
  return Object.keys(nfts)
    .filter((key) => nfts[key])
    .map((key) => {
      const [contract, tokenId] = key.split(KEY_SEPARATOR);
      return { contract, tokenId };
    });
}
