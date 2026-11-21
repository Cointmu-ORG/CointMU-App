import { useCallback, useEffect } from "react";
import { toAddressNameKey } from "@bridge/address-names";
import { useAddressNameStore } from "./address-name.store";

/**
 * @returns A lookup of the saved name for an address in any letter case,
 *   undefined when it has none. Loads the names on first use.
 */
export function useAddressNameOf(): (address: string) => string | undefined {
  const names = useAddressNameStore((s) => s.names);
  const ensureLoaded = useAddressNameStore((s) => s.ensureLoaded);
  useEffect(ensureLoaded, [ensureLoaded]);
  return useCallback(
    (address: string) => {
      const key = toAddressNameKey(address);
      return key === null ? undefined : names[key];
    },
    [names],
  );
}
