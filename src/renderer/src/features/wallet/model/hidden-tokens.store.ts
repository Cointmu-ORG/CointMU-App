import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HiddenToken } from "./wallet-asset.types";

interface HiddenTokensState {
  hidden: HiddenToken[];
  hide: (token: HiddenToken) => void;
  unhide: (address: string) => void;
}

/**
 * Tokens the user hid from the list and the send picker. A hidden token
 * stays hidden whatever its balance does, until the user shows it again
 * from "Manage hidden". Non-sensitive UI preference, so persisted locally.
 */
export const useHiddenTokensStore = create<HiddenTokensState>()(
  persist(
    (set) => ({
      hidden: [],
      hide: (token) =>
        set((state) => ({
          hidden: [
            ...state.hidden.filter((h) => h.address !== token.address),
            { ...token, address: token.address.toLowerCase() },
          ],
        })),
      unhide: (address) =>
        set((state) => ({
          hidden: state.hidden.filter(
            (h) => h.address !== address.toLowerCase(),
          ),
        })),
    }),
    { name: "cmu_hidden_tokens" },
  ),
);
