import { clipboard, ipcMain } from "electron";
import { CLIPBOARD_CHANNELS } from "../../bridge/ipc-channels";
import { ClipboardGuard } from "../app/clipboardGuard";
import type { AppStore } from "../store/appStore";

// Longer than a 24-word phrase or a keystore address list; refuses junk.
const MAX_COPY_LENGTH = 4096;

/**
 * Registers the sensitive copy: main writes the clipboard so it can clear it
 * after security.clipboardClearSeconds, even while the window is hidden.
 * @param store - The settings store.
 */
export function registerClipboardHandlers(store: AppStore): void {
  const guard = new ClipboardGuard({
    readText: () => clipboard.readText(),
    writeText: (text) => clipboard.writeText(text),
    clear: () => clipboard.clear(),
    setTimer: (run, delayMs) => {
      const timer = setTimeout(run, delayMs);
      return () => clearTimeout(timer);
    },
  });
  ipcMain.handle(CLIPBOARD_CHANNELS.COPY_SENSITIVE, (_, text: unknown) => {
    if (typeof text !== "string" || text.length > MAX_COPY_LENGTH) {
      throw new TypeError("clipboard:copy-sensitive expects a short string");
    }
    const seconds: unknown = store.get("security.clipboardClearSeconds");
    return guard.copy(text, typeof seconds === "number" ? seconds : 0);
  });
}
