import { GRADIENTS } from "../config/account.constants";

/**
 * Deterministically generates a Tailwind gradient class string based on an Ethereum address.
 * @param address - The Ethereum address.
 * @returns A Tailwind gradient class string.
 */
export function generateIdenticonGradient(address: string): string[] {
  // Simple hash of the address string to pick a gradient
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Ensure positive index
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index];
}
