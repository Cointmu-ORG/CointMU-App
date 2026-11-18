/** What the confirm step shows; copied from the send form, read-only here. */
interface SendSummary {
  fromLabel: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  symbol: string;
  tokenAddress: string;
  feeCmu: string;
  /** Native sends add the fee to the amount; token sends pay it in CMU. */
  isNative: boolean;
}

/** Where a failed confirm shows its message: under the password, or above the buttons. */
type SendConfirmErrorField = "password" | "general";

type SendConfirmResult =
  | { isOk: true }
  | { isOk: false; field: SendConfirmErrorField; message: string };

export type { SendSummary, SendConfirmErrorField, SendConfirmResult };
