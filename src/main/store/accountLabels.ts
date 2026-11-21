import { normalizeAddressName } from "../../bridge/address-names";

/** Settings key of the wallet's account list. */
export const ACCOUNTS_KEY = "accounts";

interface StoredAccount {
  readonly address?: unknown;
  readonly label?: unknown;
}

const isRecord = (value: unknown): value is StoredAccount =>
  typeof value === "object" && value !== null;

/** @returns Each stored account's label, by lowercase address. */
function labelsByAddress(stored: unknown): Map<string, unknown> {
  const labels = new Map<string, unknown>();
  if (!Array.isArray(stored)) return labels;
  for (const account of stored) {
    if (isRecord(account) && typeof account.address === "string") {
      labels.set(account.address.toLowerCase(), account.label);
    }
  }
  return labels;
}

/**
 * Checks the labels of an `accounts` write with the address name rule. A
 * label already stored for the same address passes unchanged, so an account
 * saved before the rule (or under a longer default label) can still be
 * hidden, reordered or kept while others change. Only writes are checked:
 * the startup rule pass never sees accounts, so old labels never wipe them.
 * @param next - The account list being written.
 * @param stored - The account list in the store now.
 * @returns True when the write is not a list of accounts with valid labels.
 */
export function hasInvalidAccountLabel(
  next: unknown,
  stored: unknown,
): boolean {
  if (!Array.isArray(next)) return true;
  const storedLabels = labelsByAddress(stored);
  return next.some((account) => {
    if (!isRecord(account) || typeof account.address !== "string") return true;
    const { label } = account;
    if (storedLabels.get(account.address.toLowerCase()) === label) return false;
    return typeof label !== "string" || normalizeAddressName(label) !== label;
  });
}
