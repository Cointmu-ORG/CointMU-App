import { useCallback, useEffect, useState } from "react";
import { getSetting, setSetting } from "@/shared/api";

/**
 * Reads one stored setting (dotted key) and writes changes back. The value
 * updates at once and returns to the stored one when main rejects the write.
 * @param key - The dotted settings key, e.g. "updates.autoCheck".
 * @param fallback - Shown until the stored value arrives, and for a missing one.
 * @returns The value and its setter.
 */
export function useStoredSetting<T>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    let isMounted = true;
    getSetting<T | undefined>(key)
      .then((stored) => {
        if (isMounted && stored !== undefined) setValue(stored);
      })
      .catch((err: unknown) => {
        console.error(`Failed to read setting ${key}`, err);
      });
    return () => {
      isMounted = false;
    };
  }, [key]);

  const update = useCallback(
    (next: T): void => {
      let previous: T | undefined;
      setValue((current) => {
        previous = current;
        return next;
      });
      setSetting(key, next).catch((err: unknown) => {
        console.error(`Failed to save setting ${key}`, err);
        if (previous !== undefined) setValue(previous);
      });
    },
    [key],
  );

  return [value, update];
}
