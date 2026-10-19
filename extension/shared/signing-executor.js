"use strict";

import { SigningKind } from "./signing-request.js";

/**
 * Executes an approved signing request with the standalone wallet key.
 * Runs in the background service worker, where ethers is a global.
 */

const HTTP_PREFIX = "http";
const DEFAULT_RPC_SCHEME = "http://";
const DECIMAL_RADIX = 10;

/**
 * @param {{ rpcUrl: string }} network - A custom network record.
 * @returns {string} The RPC URL with a scheme.
 */
export function resolveRpcUrl(network) {
  return network.rpcUrl.startsWith(HTTP_PREFIX)
    ? network.rpcUrl
    : DEFAULT_RPC_SCHEME + network.rpcUrl;
}

function connectedWallet(privateKey, network) {
  const { ethers } = globalThis;
  const provider = new ethers.JsonRpcProvider(
    resolveRpcUrl(network),
    parseInt(network.chainId, DECIMAL_RADIX),
    { staticNetwork: true },
  );
  return new ethers.Wallet(privateKey, provider);
}

/**
 * @param {{ kind: string, payload: object }} request - The validated request.
 * @param {{ privateKey: string, network: { rpcUrl: string, chainId: string } }} signer
 * @returns {Promise<string>} The signature, signed transaction or transaction hash.
 * @throws Error from ethers when signing or broadcasting fails.
 */
export async function executeSigning(request, { privateKey, network }) {
  const { ethers } = globalThis;
  const { kind, payload } = request;

  if (kind === SigningKind.MESSAGE) {
    const message = payload.isHex
      ? ethers.getBytes(payload.message)
      : payload.message;
    return new ethers.Wallet(privateKey).signMessage(message);
  }
  if (kind === SigningKind.TYPED_DATA) {
    return new ethers.Wallet(privateKey).signTypedData(
      payload.domain,
      payload.types,
      payload.message,
    );
  }

  const wallet = connectedWallet(privateKey, network);
  if (kind === SigningKind.SEND_TRANSACTION) {
    const tx = await wallet.sendTransaction(payload);
    return tx.hash;
  }
  if (kind === SigningKind.SIGN_TRANSACTION) {
    return wallet.signTransaction(await wallet.populateTransaction(payload));
  }
  throw new Error(`Unknown signing kind: ${kind}`);
}
