const CLEARED_EVENT = "cleared";
const cacheEvents = new EventTarget();

/**
 * Registers a renderer cache that lives in memory, to be dropped by
 * clearLocalCaches.
 * @param listener - Clears that cache.
 * @returns A function that removes the listener.
 */
export function onLocalCachesCleared(listener: () => void): () => void {
  cacheEvents.addEventListener(CLEARED_EVENT, listener);
  return () => cacheEvents.removeEventListener(CLEARED_EVENT, listener);
}

/**
 * Drops every in-memory renderer cache registered with onLocalCachesCleared
 * (Settings → Clear cache). localStorage is not touched.
 */
export function clearLocalCaches(): void {
  cacheEvents.dispatchEvent(new Event(CLEARED_EVENT));
}
