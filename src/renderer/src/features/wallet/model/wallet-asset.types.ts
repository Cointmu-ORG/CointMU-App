/** Key of the native coin in token lists, logos and the send form. */
export const NATIVE_ASSET_ADDRESS = "native";

/** One row of the token list and the send asset picker. */
export interface WalletAsset {
  /** NATIVE_ASSET_ADDRESS or a lowercase contract address. */
  readonly address: string;
  /** Untrusted for tokens: render as plain text only. */
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  /** In the asset's smallest unit. */
  readonly balance: bigint;
  /** Found by the Transfer log scan rather than added by address. */
  readonly isAutoDetected: boolean;
}

/** What the "Manage hidden" list needs to name a hidden token. */
export interface HiddenToken {
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
}
