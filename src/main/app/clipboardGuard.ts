/** Clipboard access and a timer; the app passes Electron's, tests fakes. */
export interface ClipboardDeps {
  readonly readText: () => Promise<string>;
  readonly writeText: (text: string) => Promise<void>;
  readonly clear: () => void;
  readonly setTimer: (run: () => void, delayMs: number) => () => void;
}

const MS_PER_SECOND = 1000;

/**
 * Copies sensitive text (addresses, keys, the recovery phrase) and clears
 * the clipboard after a delay, but only while it still holds that text:
 * anything the user copied since is left alone. A newer copy replaces the
 * pending clear.
 */
export class ClipboardGuard {
  private cancelPending: (() => void) | null = null;

  constructor(private readonly deps: ClipboardDeps) {}

  /**
   * @param text - What to copy.
   * @param clearAfterSeconds - 0 keeps it on the clipboard.
   * @returns Resolves once the text is on the clipboard.
   */
  public async copy(text: string, clearAfterSeconds: number): Promise<void> {
    this.cancelPending?.();
    this.cancelPending = null;
    await this.deps.writeText(text);
    if (clearAfterSeconds <= 0) return;
    this.cancelPending = this.deps.setTimer(() => {
      this.cancelPending = null;
      void this.clearIfUnchanged(text);
    }, clearAfterSeconds * MS_PER_SECOND);
  }

  private async clearIfUnchanged(text: string): Promise<void> {
    try {
      if ((await this.deps.readText()) === text) this.deps.clear();
    } catch (err) {
      console.warn("[clipboard] Could not check the clipboard:", err);
    }
  }
}
