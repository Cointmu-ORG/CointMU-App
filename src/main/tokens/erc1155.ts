import { Interface, type LogDescription } from "ethers";
import type { EthCall } from "./erc20Calls";
import type { NftOwnership } from "./nftOwnership";

const KEY_SEPARATOR = ":";

const erc1155 = new Interface([
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

/** keccak256 of the TransferSingle and TransferBatch event signatures. */
export const TRANSFER_SINGLE_TOPIC =
  erc1155.getEvent("TransferSingle")?.topicHash ?? "";
export const TRANSFER_BATCH_TOPIC =
  erc1155.getEvent("TransferBatch")?.topicHash ?? "";

/** An ERC-1155 log; the ids and values are ABI-encoded in data. */
export interface Erc1155Log {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data?: string;
}

function parseTransfer(log: Erc1155Log): LogDescription | null {
  try {
    return erc1155.parseLog({
      topics: [...log.topics],
      data: log.data ?? "0x",
    });
  } catch {
    // Not a well-formed ERC-1155 transfer (wrong topic count, bad data).
    return null;
  }
}

function tokenIds(parsed: LogDescription): readonly bigint[] {
  return parsed.name === "TransferSingle"
    ? [parsed.args.id as bigint]
    : [...(parsed.args.ids as bigint[])];
}

/**
 * @param logs - TransferSingle and TransferBatch logs to or from one account.
 * @returns Unique "contract:tokenId" keys (decimal id, lowercase contract); malformed logs are skipped.
 */
export function erc1155Keys(logs: readonly Erc1155Log[]): string[] {
  const keys = logs.flatMap((log) => {
    const parsed = parseTransfer(log);
    if (parsed === null) return [];
    const contract = log.address.toLowerCase();
    return tokenIds(parsed).map(
      (id) => contract + KEY_SEPARATOR + id.toString(),
    );
  });
  return [...new Set(keys)];
}

/**
 * Confirms holdings with balanceOf(account, id); a revert means not held.
 * @param call - The eth_call function.
 * @param account - The lowercase account.
 * @param keys - "contract:tokenId" keys to check.
 * @returns Whether the account holds a balance above zero of each key.
 */
export async function readErc1155Ownership(
  call: EthCall,
  account: string,
  keys: readonly string[],
): Promise<NftOwnership> {
  const held = await Promise.all(
    keys.map(async (key) => {
      const [contract, tokenId] = key.split(KEY_SEPARATOR);
      const result = await call(
        contract,
        erc1155.encodeFunctionData("balanceOf", [account, tokenId]),
      );
      if (result === null || result === "0x") return false;
      try {
        return (
          (erc1155.decodeFunctionResult("balanceOf", result)[0] as bigint) > 0n
        );
      } catch {
        return false;
      }
    }),
  );
  return Object.fromEntries(keys.map((key, i) => [key, held[i]]));
}
