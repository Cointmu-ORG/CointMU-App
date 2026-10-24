/**
 * Typed wrapper around the electron-store settings IPC bridge. Centralizes all
 * persisted-configuration access so that view and hook layers never reference
 * the raw window.api surface directly.
 */

/**
 * Reads a single persisted setting by key.
 * @param key - The dot-delimited settings key.
 * @returns The stored value, or undefined when unset.
 */
async function getSetting<T = unknown>(key: string): Promise<T> {
  return window.api.settings.get(key) as Promise<T>;
}

/**
 * Persists a single setting value by key.
 * @param key - The dot-delimited settings key.
 * @param value - The value to persist.
 * @returns A promise resolving once the value is written.
 */
async function setSetting(key: string, value: unknown): Promise<void> {
  return window.api.settings.set(key, value);
}

/**
 * Reads the entire persisted settings tree.
 * @returns The full settings object.
 */
async function getAllSettings(): Promise<Record<string, any>> {
  return window.api.settings.getAll();
}

export { getSetting, setSetting, getAllSettings };
