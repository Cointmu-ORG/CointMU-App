import { Interface, decodeBytes32String } from "ethers";

/** keccak256("Transfer(address,address,uint256)"). */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** ERC-20 Transfer has 3 topics (value in data); ERC-721 indexes the token id as a 4th. */
export const ERC20_TRANSFER_TOPIC_COUNT = 3;
/** First 4 bytes of transfer(address,uint256) call data. */
export const TRANSFER_SELECTOR = "0xa9059cbb";

const MAX_NAME_CHARS = 40;
const MAX_SYMBOL_CHARS = 12;
const DEFAULT_DECIMALS = 18;
const MAX_DECIMALS = 36;
// Control characters, zero-width marks and bidi overrides let a name pose as
// another token. Inclusive code point ranges.
const UNSAFE_CODE_POINTS: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];

const isSafeChar = (char: string): boolean => {
  const code = char.codePointAt(0) ?? 0;
  return !UNSAFE_CODE_POINTS.some(([low, high]) => code >= low && code <= high);
};

const erc20 = new Interface([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);
const bytes32Text = new Interface([
  "function name() view returns (bytes32)",
  "function symbol() view returns (bytes32)",
]);

/** Name, symbol and decimals of an ERC-20 contract, cleaned of untrusted text. */
export interface TokenMeta {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

/** Runs one eth_call; resolves null when the contract reverts or the node errors. */
export type EthCall = (to: string, data: string) => Promise<string | null>;

/**
 * Strips control and bidi characters and caps the length. The result is
 * still untrusted: the renderer shows it as plain text only.
 * @param raw - The text a contract returned.
 * @param maxChars - The length cap.
 * @returns The cleaned text.
 */
export function sanitizeTokenText(raw: string, maxChars: number): string {
  return Array.from(Array.from(raw).filter(isSafeChar).join("").trim())
    .slice(0, maxChars)
    .join("");
}

function decodeText(method: "name" | "symbol", result: string | null): string {
  if (result === null || result === "0x") return "";
  try {
    return String(erc20.decodeFunctionResult(method, result)[0]);
  } catch {
    // Some early tokens (MKR-style) return bytes32 instead of string.
  }
  try {
    return decodeBytes32String(
      bytes32Text.decodeFunctionResult(method, result)[0],
    );
  } catch {
    return "";
  }
}

function decodeDecimals(result: string | null): number {
  if (result === null || result === "0x") return DEFAULT_DECIMALS;
  try {
    const value = Number(erc20.decodeFunctionResult("decimals", result)[0]);
    return value <= MAX_DECIMALS ? value : DEFAULT_DECIMALS;
  } catch {
    return DEFAULT_DECIMALS;
  }
}

/**
 * Reads name/symbol/decimals; a reverting or non-standard method falls back
 * to "" (name, symbol) or 18 (decimals) instead of failing.
 * @param call - The eth_call function.
 * @param contract - The token contract.
 * @returns The cleaned metadata.
 */
export async function readTokenMeta(
  call: EthCall,
  contract: string,
): Promise<TokenMeta> {
  const [name, symbol, decimals] = await Promise.all(
    (["name", "symbol", "decimals"] as const).map((method) =>
      call(contract, erc20.encodeFunctionData(method)),
    ),
  );
  return {
    name: sanitizeTokenText(decodeText("name", name), MAX_NAME_CHARS),
    symbol: sanitizeTokenText(decodeText("symbol", symbol), MAX_SYMBOL_CHARS),
    decimals: decodeDecimals(decimals),
  };
}

/**
 * @param call - The eth_call function.
 * @param contract - The token contract.
 * @param owner - The account.
 * @returns The raw balance as a decimal string; "0" when the call fails.
 */
export async function readTokenBalance(
  call: EthCall,
  contract: string,
  owner: string,
): Promise<string> {
  const result = await call(
    contract,
    erc20.encodeFunctionData("balanceOf", [owner]),
  );
  if (result === null || result === "0x") return "0";
  try {
    return erc20.decodeFunctionResult("balanceOf", result)[0].toString();
  } catch {
    return "0";
  }
}
