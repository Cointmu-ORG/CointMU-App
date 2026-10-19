import { ethers } from "ethers";
import { createNodeProvider } from "@/shared/api";

export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  price: string;
  change: string;
  decimals: number;
}

const LOCAL_STORAGE_KEY = "cmu_wallet_tokens";

const DEFAULT_TOKENS: TokenInfo[] = [
  {
    symbol: "CMU",
    name: "CointMU",
    address: "native",
    price: "N/A",
    change: "",
    decimals: 18,
  },
];

export class TokenService {
  /**
   * Retrieves the saved list of tokens from localStorage. Falls back to default CMU
   * native token if none are found.
   * @returns An array of TokenInfo objects.
   */
  static getTokens(): TokenInfo[] {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as TokenInfo[];
        const withoutNative = parsed.filter((t) => t.address !== "native");
        return [DEFAULT_TOKENS[0], ...withoutNative];
      }
    } catch {
      // Ignored
    }
    return DEFAULT_TOKENS;
  }

  /**
   * Appends a new token to the persisted token list.
   * @param token - The new token info object.
   */
  static addToken(token: TokenInfo): void {
    const tokens = this.getTokens();
    if (
      !tokens.some(
        (t) => t.address.toLowerCase() === token.address.toLowerCase(),
      )
    ) {
      const withoutNative = tokens.filter((t) => t.address !== "native");
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify([...withoutNative, token]),
      );
    }
  }

  /**
   * Removes a token from the persisted list by contract address.
   * @param address - The ERC-20 contract address to remove.
   */
  static removeToken(address: string): void {
    const tokens = this.getTokens();
    const withoutNative = tokens.filter(
      (t) =>
        t.address !== "native" &&
        t.address.toLowerCase() !== address.toLowerCase(),
    );
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(withoutNative));
  }

  /**
   * Queries the ERC-20 contract for its name, symbol, and decimals.
   * @param address - The smart contract address.
   * @returns A promise resolving to a partial TokenInfo or null if invalid.
   */
  static async fetchTokenDetails(
    address: string,
  ): Promise<Partial<TokenInfo> | null> {
    try {
      const provider = createNodeProvider();
      const contract = new ethers.Contract(
        address,
        STANDARD_ERC20_ABI,
        provider,
      );

      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals().catch(() => 18),
      ]);

      return {
        name,
        symbol,
        decimals: Number(decimals),
        address,
        price: "N/A",
        change: "",
      };
    } catch (error) {
      console.error(`Failed to fetch details for token at ${address}`, error);
      return null;
    }
  }
}

/**
 * Comprehensive standard ERC-20 ABI covering all canonical read and write
 * functions defined in EIP-20.
 */
export const STANDARD_ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

/**
 * Retrieves the ERC-20 token balance for a specific wallet address.
 * @param walletAddress - The owner wallet address.
 * @param tokenContractAddress - The smart contract address of the ERC-20 token.
 * @returns A promise resolving to the token balance as a formatted string.
 */
export async function getTokenBalance(
  walletAddress: string,
  tokenContractAddress: string,
): Promise<string> {
  if (!walletAddress || !tokenContractAddress) return "0.00";

  try {
    const provider = createNodeProvider();

    if (tokenContractAddress === "native") {
      const balanceBigInt = await provider.getBalance(walletAddress);
      return parseFloat(ethers.formatEther(balanceBigInt)).toFixed(2);
    }

    const contract = new ethers.Contract(
      tokenContractAddress,
      STANDARD_ERC20_ABI,
      provider,
    );

    const [balanceBigInt, decimals] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals().catch(() => 18),
    ]);

    return parseFloat(ethers.formatUnits(balanceBigInt, decimals)).toFixed(2);
  } catch (error) {
    console.error(`Failed to fetch balance for ${tokenContractAddress}`, error);
    return "0.00";
  }
}
