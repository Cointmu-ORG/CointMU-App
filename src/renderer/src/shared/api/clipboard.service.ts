/**
 * Copies an address, key or recovery phrase through the main process, which
 * clears it again after the delay chosen in Settings → Security unless the
 * user copied something else meanwhile.
 * @param text - What to copy.
 * @returns Resolves once it is on the clipboard.
 */
async function copySensitive(text: string): Promise<void> {
  return window.api.clipboard.copySensitive(text);
}

export { copySensitive };
