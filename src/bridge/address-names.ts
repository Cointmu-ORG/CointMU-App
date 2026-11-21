/**
 * User-managed names for addresses. Labels only: a send always uses the raw
 * address, and a name is never resolved to one. Shared by main (which
 * validates every write) and the renderer.
 */

/** Settings key of the name map: lowercase address → name. */
export const ADDRESS_NAMES_KEY = "addressNames";
export const MAX_ADDRESS_NAME_LENGTH = 32;
/** Names kept at most, so a hand-edited or flooded map stays small. */
export const MAX_ADDRESS_NAMES = 500;

export type AddressNames = Readonly<Record<string, string>>;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const LOWERCASE_ADDRESS = /^0x[0-9a-f]{40}$/;
// Names are single-line display text: tabs and newlines become spaces, other control characters are refused.
const CONTROL_CHARACTER = /\p{Cc}/u;
// Invisible format characters (bidi overrides and isolates, zero-width space,
// BOM) can disguise a name. ZWJ (U+200D) stays allowed: emoji such as 👨‍👩‍👧 need it.
const FORMAT_CHARACTER = /(?!\u200D)\p{Cf}/u;
const WHITESPACE_RUN = /\s+/g;

/**
 * @param input - What the user typed.
 * @returns The trimmed name with inner spaces collapsed, or null when it is
 *   empty, longer than MAX_ADDRESS_NAME_LENGTH or holds a control character
 *   or an invisible format character other than ZWJ.
 */
export function normalizeAddressName(input: string): string | null {
  if (CONTROL_CHARACTER.test(input.replace(WHITESPACE_RUN, " "))) return null;
  if (FORMAT_CHARACTER.test(input)) return null;
  const name = input.trim().replace(WHITESPACE_RUN, " ");
  if (name === "" || name.length > MAX_ADDRESS_NAME_LENGTH) return null;
  return name;
}

/**
 * @param address - A 0x address in any letter case.
 * @returns Its key in the name map, or null when it is not an address.
 */
export function toAddressNameKey(address: string): string | null {
  return ADDRESS.test(address) ? address.toLowerCase() : null;
}

/** @returns True for a map of lowercase addresses to normalized names. */
export function isAddressNames(value: unknown): value is AddressNames {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value);
  return (
    entries.length <= MAX_ADDRESS_NAMES &&
    entries.every(
      ([key, name]) =>
        LOWERCASE_ADDRESS.test(key) &&
        typeof name === "string" &&
        normalizeAddressName(name) === name,
    )
  );
}
