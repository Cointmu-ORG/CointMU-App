import { Interface } from "ethers";
import { describe, expect, it, vi } from "vitest";
import type { DetectedNft } from "../../bridge/types";
import {
  loadDetectedNftMedia,
  parseNftMediaRequest,
  type NftMediaDeps,
} from "./nftMediaRequest";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const NFT = "0xcccccccccccccccccccccccccccccccccccccccc";
const URI = "ipfs://Qm1/meta.json";
const erc721 = new Interface([
  "function tokenURI(uint256) view returns (string)",
]);
const MEDIA = { name: "N", description: "", image: "" };

function deps(owned: readonly DetectedNft[]) {
  const call = vi.fn(async () =>
    erc721.encodeFunctionResult("tokenURI", [URI]),
  );
  const load = vi.fn(async () => MEDIA);
  const value: NftMediaDeps = { detectedNfts: () => owned, call, load };
  return { value, call, load };
}

describe("parseNftMediaRequest", () => {
  it("refuses anything but an account, a contract and a decimal token id", () => {
    expect(() => parseNftMediaRequest(ACCOUNT, NFT, "1")).not.toThrow();
    expect(() =>
      parseNftMediaRequest(ACCOUNT, "https://10.0.0.1/a", "1"),
    ).toThrow(TypeError);
    expect(() => parseNftMediaRequest("me", NFT, "1")).toThrow(TypeError);
    expect(() => parseNftMediaRequest(ACCOUNT, NFT, "1e3")).toThrow(TypeError);
    expect(() => parseNftMediaRequest(ACCOUNT, NFT, 1)).toThrow(TypeError);
  });
});

describe("loadDetectedNftMedia", () => {
  it("refuses a contract/token id the scan did not detect for the account", async () => {
    const { value, call, load } = deps([{ contract: NFT, tokenId: "1" }]);
    const request = parseNftMediaRequest(ACCOUNT, NFT, "2");

    await expect(loadDetectedNftMedia(request, value)).rejects.toThrow(
      "not a detected NFT",
    );
    expect(call).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("reads tokenURI on-chain for a detected NFT and loads it", async () => {
    const { value, load } = deps([{ contract: NFT, tokenId: "1" }]);
    const request = parseNftMediaRequest(
      ACCOUNT,
      NFT.toUpperCase().replace("0X", "0x"),
      "1",
    );

    expect(await loadDetectedNftMedia(request, value)).toBe(MEDIA);
    expect(load).toHaveBeenCalledWith(URI);
  });
});
