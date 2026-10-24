import {
  ASCII_PRINTABLE_MIN,
  ASCII_PRINTABLE_MAX,
  HEX_RADIX,
  HEX_CHARS_PER_BYTE,
} from "../config/explorer.constants";

/**
 * Decodes a hex string into its printable ASCII representation, skipping any
 * bytes that fall outside the printable ASCII range.
 * @param hex - The hex string, with or without a leading 0x prefix.
 * @returns The decoded printable ASCII string.
 */
export function hexToAscii(hex: string): string {
  const cleaned = hex.startsWith("0x") ? hex.slice(2) : hex;
  let str = "";
  for (let i = 0; i < cleaned.length; i += HEX_CHARS_PER_BYTE) {
    const charCode = parseInt(cleaned.substr(i, HEX_CHARS_PER_BYTE), HEX_RADIX);
    if (charCode > ASCII_PRINTABLE_MIN && charCode < ASCII_PRINTABLE_MAX) {
      str += String.fromCharCode(charCode);
    }
  }
  return str;
}
