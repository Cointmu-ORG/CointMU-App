import { ethers } from "ethers";
import { STANDARD_ERC20_ABI } from "@/features/wallet";
import { call } from "@/shared/api/rpc.client";
import { createNodeProvider } from "@/shared/api";
import { getSetting } from "@/features/settings";
import {
  getSessionPassword,
  decryptSecret,
  type DerivedAccount,
} from "@/features/wallet";

/**
 * Resolves the local node provider, relayed through the main process.
 * @returns A configured ethers provider instance.
 */
function getProvider(): ethers.JsonRpcApiProvider {
  return createNodeProvider();
}

/**
 * Decrypts the private key for the given account and returns a connected signer.
 * Supports both HD wallet phrases and accounts with individually encrypted keys.
 * @param activeAccount - The derived account record to unlock.
 * @param password - The session password used for decryption.
 * @returns A promise resolving to a connected ethers Wallet signer.
 * @throws Error when the wallet is locked or credentials cannot be decrypted.
 */
export async function resolveWallet(
  activeAccount: DerivedAccount,
  password: string,
): Promise<ethers.Wallet | ethers.HDNodeWallet> {
  const provider = getProvider();

  if (activeAccount.encryptedKey) {
    const secret = await decryptSecret(activeAccount.encryptedKey, password);
    return new ethers.Wallet(secret, provider);
  }

  const encryptedPayload = await getSetting<string | null>("encryptedPayload");
  if (!encryptedPayload) throw new Error("Wallet is not unlocked.");

  const secretKey = await decryptSecret(encryptedPayload, password);

  if (secretKey.split(" ").length === 12) {
    return ethers.HDNodeWallet.fromPhrase(
      secretKey,
      undefined,
      `m/44'/60'/0'/0/${activeAccount.index}`,
    ).connect(provider);
  }

  return new ethers.Wallet(secretKey, provider);
}

/**
 * Estimates the gas required for a native-coin transfer.
 * @param from - The sender address.
 * @param to - The recipient address.
 * @param value - The transfer value in wei.
 * @returns A promise resolving to the estimated gas limit as a bigint.
 */
export async function estimateNativeTransferGas(
  from: string,
  to: string,
  value: bigint,
): Promise<bigint> {
  const provider = getProvider();
  return provider.estimateGas({ from, to, value });
}

/**
 * Estimates the gas required for an ERC-20 token transfer.
 * @param contractAddress - The ERC-20 contract address.
 * @param from - The sender address.
 * @param to - The recipient address.
 * @param amount - The token amount in human-readable units.
 * @param decimals - The token decimal places.
 * @returns A promise resolving to the estimated gas limit as a bigint.
 */
export async function estimateErc20TransferGas(
  contractAddress: string,
  from: string,
  to: string,
  amount: string,
  decimals: number,
): Promise<bigint> {
  const provider = getProvider();
  const iface = new ethers.Interface(STANDARD_ERC20_ABI);
  const data = iface.encodeFunctionData("transfer", [
    to,
    ethers.parseUnits(amount, decimals),
  ]);
  return provider.estimateGas({ from, to: contractAddress, data });
}

/**
 * Signs and broadcasts a native-coin transfer as a raw transaction.
 * @param wallet - The connected signer.
 * @param to - The recipient address.
 * @param amount - The transfer amount in CMU (ether units).
 * @param gasLimit - The gas limit bigint from estimation.
 * @param gasPrice - The gas price as a hex string from the node.
 * @param nonce - The sender nonce.
 * @param chainId - The network chain ID.
 * @returns A promise resolving to the broadcast transaction hash.
 * @throws Error when the node rejects or returns a malformed hash.
 */
export async function executeNativeTransfer(
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  to: string,
  amount: string,
  gasLimit: bigint,
  gasPrice: string,
  nonce: number,
  chainId: number,
): Promise<string> {
  const tx = {
    to,
    value: ethers.parseEther(amount),
    gasLimit,
    gasPrice: BigInt(gasPrice),
    nonce,
    chainId,
  };

  const signedTx = await wallet.signTransaction(tx);
  const txHash = await call("eth_sendRawTransaction", [signedTx]);

  if (!txHash || !txHash.startsWith("0x")) {
    throw new Error("Node returned an invalid transaction hash.");
  }

  return txHash;
}

/**
 * Signs and broadcasts an ERC-20 token transfer as a raw transaction.
 * @param wallet - The connected signer.
 * @param contractAddress - The ERC-20 contract address.
 * @param to - The recipient address.
 * @param amount - The token amount in human-readable units.
 * @param decimals - The token decimal places.
 * @param gasLimit - The gas limit bigint from estimation.
 * @param gasPrice - The gas price as a hex string from the node.
 * @param nonce - The sender nonce.
 * @param chainId - The network chain ID.
 * @returns A promise resolving to the broadcast transaction hash.
 * @throws Error when the node rejects or returns a malformed hash.
 */
export async function executeErc20Transfer(
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  contractAddress: string,
  to: string,
  amount: string,
  decimals: number,
  gasLimit: bigint,
  gasPrice: string,
  nonce: number,
  chainId: number,
): Promise<string> {
  const iface = new ethers.Interface(STANDARD_ERC20_ABI);
  const data = iface.encodeFunctionData("transfer", [
    to,
    ethers.parseUnits(amount, decimals),
  ]);

  const tx = {
    to: contractAddress,
    value: 0n,
    data,
    gasLimit,
    gasPrice: BigInt(gasPrice),
    nonce,
    chainId,
  };

  const signedTx = await wallet.signTransaction(tx);
  const txHash = await call("eth_sendRawTransaction", [signedTx]);

  if (!txHash || !txHash.startsWith("0x")) {
    throw new Error("Node returned an invalid transaction hash.");
  }

  return txHash;
}

/**
 * Retrieves the session password and throws if the wallet is locked.
 * @returns The active session password string.
 * @throws Error when no active session password is found.
 */
export function requireSessionPassword(): string {
  const password = getSessionPassword();
  if (!password) throw new Error("Wallet is locked. Please log in again.");
  return password;
}

/**
 * Parses a blockchain error into a human-readable message, extracting
 * revert reasons, out-of-gas indicators, or user-rejection signals.
 * @param error - The caught error from an ethers or RPC operation.
 * @returns A concise, user-facing error string.
 */
export function parseTransferError(error: unknown): string {
  if (!(error instanceof Error)) return "An unexpected error occurred.";

  const msg = error.message.toLowerCase();

  if (msg.includes("insufficient funds"))
    return "Insufficient funds to cover amount and network fee.";
  if (msg.includes("out of gas"))
    return "Transaction ran out of gas. Try increasing the gas limit.";
  if (msg.includes("nonce too low"))
    return "Nonce conflict. Please wait for pending transactions to settle.";
  if (msg.includes("revert")) return "Transaction reverted by the contract.";
  if (msg.includes("user rejected") || msg.includes("user denied"))
    return "Transaction rejected.";
  if (msg.includes("invalid transaction hash"))
    return "Node rejected the transaction. Check the recipient address.";

  return error.message;
}
