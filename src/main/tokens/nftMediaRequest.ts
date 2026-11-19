import type { DetectedNft, NftMedia } from "../../bridge/types";
import type { EthCall } from "./erc20Calls";
import { readTokenUri } from "./nftOwnership";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** uint256 in decimal is at most 78 digits. */
const TOKEN_ID = /^(0|[1-9][0-9]{0,77})$/;
const EMPTY_MEDIA: NftMedia = { name: "", description: "", image: "" };

/** An NFT of a wallet account whose media the renderer asks for. */
export interface NftMediaRequest {
  readonly account: string;
  readonly contract: string;
  readonly tokenId: string;
}

export interface NftMediaDeps {
  /** The NFTs the scan confirmed the account owns. */
  readonly detectedNfts: (account: string) => readonly DetectedNft[];
  readonly call: EthCall;
  readonly load: (tokenUri: string) => Promise<NftMedia>;
}

/**
 * Validates the renderer's arguments; nothing from the renderer is a URL.
 * @throws {TypeError} On a malformed account, contract or token id.
 */
export function parseNftMediaRequest(
  account: unknown,
  contract: unknown,
  tokenId: unknown,
): NftMediaRequest {
  if (typeof account !== "string" || !ADDRESS.test(account)) {
    throw new TypeError("nft media: invalid account");
  }
  if (typeof contract !== "string" || !ADDRESS.test(contract)) {
    throw new TypeError("nft media: invalid contract");
  }
  if (typeof tokenId !== "string" || !TOKEN_ID.test(tokenId)) {
    throw new TypeError("nft media: invalid token id");
  }
  return { account, contract: contract.toLowerCase(), tokenId };
}

/**
 * Reads tokenURI on-chain and loads its media, only for an NFT the scan
 * detected for that account.
 * @throws {TypeError} When the pair is not a detected NFT of the account.
 */
export async function loadDetectedNftMedia(
  request: NftMediaRequest,
  deps: NftMediaDeps,
): Promise<NftMedia> {
  const isDetected = deps
    .detectedNfts(request.account)
    .some(
      (nft) =>
        nft.contract === request.contract && nft.tokenId === request.tokenId,
    );
  if (!isDetected) throw new TypeError("nft media: not a detected NFT");
  const tokenUri = await readTokenUri(
    deps.call,
    request.contract,
    request.tokenId,
  );
  return tokenUri === "" ? EMPTY_MEDIA : deps.load(tokenUri);
}
