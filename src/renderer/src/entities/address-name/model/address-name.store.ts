import { create } from "zustand";
import {
  ADDRESS_NAMES_KEY,
  type AddressNames,
  isAddressNames,
  toAddressNameKey,
} from "@bridge/address-names";
import { getSetting, setSetting } from "@/shared/api";

interface AddressNameState {
  names: AddressNames;
  isLoaded: boolean;
  /** Loads the names once; later calls are no-ops. */
  ensureLoaded: () => void;
  /** Saves an already normalized name; main validates the map again. */
  save: (address: string, name: string) => Promise<void>;
  remove: (address: string) => Promise<void>;
}

async function persist(names: AddressNames): Promise<void> {
  await setSetting(ADDRESS_NAMES_KEY, names);
}

/**
 * The user's names for other addresses, shared by every view that shows an
 * address. Labels only: nothing resolves a name back to an address.
 */
export const useAddressNameStore = create<AddressNameState>((set, get) => ({
  names: {},
  isLoaded: false,
  ensureLoaded: () => {
    if (get().isLoaded) return;
    set({ isLoaded: true });
    const load = async (): Promise<void> => {
      try {
        const stored = await getSetting<unknown>(ADDRESS_NAMES_KEY);
        set({ names: isAddressNames(stored) ? stored : {} });
      } catch (err) {
        set({ isLoaded: false });
        console.error("Failed to load address names", err);
      }
    };
    void load();
  },
  save: async (address, name) => {
    const key = toAddressNameKey(address);
    if (key === null) throw new TypeError("address name: invalid address");
    const names = { ...get().names, [key]: name };
    await persist(names);
    set({ names });
  },
  remove: async (address) => {
    const key = toAddressNameKey(address);
    if (key === null) return;
    const { [key]: _removed, ...names } = get().names;
    await persist(names);
    set({ names });
  },
}));
