import {
  ADDRESS_LENGTH,
  HASH_LENGTH,
  WEI_PER_CMU,
  WEI_PER_GWEI,
  HEX_RADIX,
} from "../config/explorer.constants";
import { call, fetchBalance } from "@/shared/api";

type SearchType = "block" | "address" | "hash";

interface TransactionDetailData {
  hash: string;
  status: "success" | "failed" | "pending";
  blockNumber: number | null;
  timestamp: number | null;
  from: string;
  to: string | null;
  valueCmu: number;
  gasPriceGwei: number;
  gasUsed: number | null;
  gasLimit: number;
  feeCmu: number | null;
  nonce: number;
  input: string;
}

interface AddressSummary {
  balance: string;
  isContract: boolean;
  sentCount: number;
}

/**
 * Classifies a raw search query into the explorer entity it refers to. A purely
 * numeric string is a block number, a 0x string of 42 characters is an address,
 * and a 0x string of 66 characters is a transaction or block hash.
 * @param value - The raw search input.
 * @returns The detected search type, or null when the input is unrecognized.
 */
function detectSearchType(value: string): SearchType | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    return "block";
  }
  if (trimmed.startsWith("0x") && trimmed.length === ADDRESS_LENGTH) {
    return "address";
  }
  if (trimmed.startsWith("0x") && trimmed.length === HASH_LENGTH) {
    return "hash";
  }
  return null;
}

/**
 * Fetches and normalizes a full transaction detail, combining the transaction,
 * its receipt (for status and actual gas used), and the containing block (for
 * the timestamp). Values are converted from hex/wei into display-ready numbers.
 * @param hash - The transaction hash to inspect.
 * @returns The normalized transaction detail, or null when not found.
 */
async function getTransactionDetail(
  hash: string,
): Promise<TransactionDetailData | null> {
  const tx = await call("eth_getTransactionByHash", [hash]);
  if (!tx) {
    return null;
  }

  const receipt = await call("eth_getTransactionReceipt", [hash]);

  let timestamp: number | null = null;
  if (tx.blockNumber) {
    const block = await call("eth_getBlockByNumber", [tx.blockNumber, false]);
    if (block && typeof block.timestamp === "string") {
      timestamp = parseInt(block.timestamp, HEX_RADIX);
    }
  }

  const gasPrice = parseInt(tx.gasPrice, HEX_RADIX);
  const gasLimit = parseInt(tx.gas, HEX_RADIX);
  const gasUsed =
    receipt && typeof receipt.gasUsed === "string"
      ? parseInt(receipt.gasUsed, HEX_RADIX)
      : null;
  const status: TransactionDetailData["status"] = receipt
    ? receipt.status === "0x1"
      ? "success"
      : "failed"
    : "pending";

  return {
    hash: tx.hash,
    status,
    blockNumber: tx.blockNumber ? parseInt(tx.blockNumber, HEX_RADIX) : null,
    timestamp,
    from: tx.from,
    to: tx.to ?? null,
    valueCmu: Number(BigInt(tx.value)) / Number(WEI_PER_CMU),
    gasPriceGwei: gasPrice / WEI_PER_GWEI,
    gasUsed,
    gasLimit,
    feeCmu:
      gasUsed !== null ? (gasUsed * gasPrice) / Number(WEI_PER_CMU) : null,
    nonce: parseInt(tx.nonce, HEX_RADIX),
    input: tx.input ?? "0x",
  };
}

/**
 * Fetches the live, node-derived summary for an arbitrary address: its formatted
 * balance, whether it is a contract (non-empty code) or an externally owned
 * account, and its sent-transaction count from the account nonce.
 * @param address - The address to summarize.
 * @returns The address summary.
 */
async function getAddressSummary(address: string): Promise<AddressSummary> {
  const [balance, code, nonceHex] = await Promise.all([
    fetchBalance(address),
    call("eth_getCode", [address, "latest"]),
    call("eth_getTransactionCount", [address, "latest"]),
  ]);

  return {
    balance: balance ?? "0.00",
    isContract: typeof code === "string" && code !== "0x" && code !== "0x0",
    sentCount: typeof nonceHex === "string" ? parseInt(nonceHex, HEX_RADIX) : 0,
  };
}

export { detectSearchType, getTransactionDetail, getAddressSummary };
export type { SearchType, TransactionDetailData, AddressSummary };
