import * as ethers from "ethers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeSigning, resolveRpcUrl } from "./signing-executor.js";
import { SigningKind, parseSigningRequest } from "./signing-request.js";

const CHAIN_ID = 1912n;
// A throwaway key per run; nothing is broadcast.
const signer = ethers.Wallet.createRandom();
const TEST_PRIVATE_KEY = signer.privateKey;
const CONTEXT = { activeAddress: signer.address, chainId: CHAIN_ID };

describe("executeSigning", () => {
  beforeAll(() => {
    globalThis.ethers = ethers;
  });

  afterAll(() => {
    delete globalThis.ethers;
  });

  it("signs a personal_sign hex message recoverably", async () => {
    const { request } = parseSigningRequest(
      "personal_sign",
      [ethers.hexlify(ethers.toUtf8Bytes("hello")), signer.address],
      CONTEXT,
    );
    const signature = await executeSigning(request, {
      privateKey: TEST_PRIVATE_KEY,
    });
    expect(ethers.verifyMessage("hello", signature)).toBe(signer.address);
  });

  it("signs v4 typed data recoverably", async () => {
    const domain = { name: "Mail", version: "1", chainId: Number(CHAIN_ID) };
    const types = { Mail: [{ name: "contents", type: "string" }] };
    const message = { contents: "hi" };
    const { request } = parseSigningRequest(
      "eth_signTypedData_v4",
      [
        signer.address,
        JSON.stringify({
          domain,
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
            ],
            ...types,
          },
          primaryType: "Mail",
          message,
        }),
      ],
      CONTEXT,
    );
    expect(request.kind).toBe(SigningKind.TYPED_DATA);
    const signature = await executeSigning(request, {
      privateKey: TEST_PRIVATE_KEY,
    });
    expect(ethers.verifyTypedData(domain, types, message, signature)).toBe(
      signer.address,
    );
  });
});

describe("resolveRpcUrl", () => {
  it("adds a scheme when missing", () => {
    expect(resolveRpcUrl({ rpcUrl: "127.0.0.1:8545" })).toBe(
      "http://127.0.0.1:8545",
    );
    expect(resolveRpcUrl({ rpcUrl: "https://rpc.example" })).toBe(
      "https://rpc.example",
    );
  });
});
