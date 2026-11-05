import { Notification, type BrowserWindow } from "electron";
import { fillText, getShellText } from "../app/shellText";
import { AUTO_START_DELAY_MS } from "./miningAutoStart";

const MS_PER_SECOND = 1_000;

/**
 * @param win - The main window, also when the app opened in the background.
 */
function showWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/**
 * Shows the desktop notification that mining starts soon, in the UI
 * language. A click opens the window, whose banner has Cancel; macOS also
 * shows a Cancel button on the notification (other systems ignore it).
 * @param win - The main window.
 * @param onCancel - Called for the Cancel button.
 * @returns Closes the notification; a no-op where notifications are unsupported.
 */
export function showAutoStartNotice(
  win: BrowserWindow,
  onCancel: () => void,
): () => void {
  if (!Notification.isSupported()) return () => undefined;
  const text = getShellText();
  const notice = new Notification({
    title: fillText(text.autoStartTitle, {
      seconds: AUTO_START_DELAY_MS / MS_PER_SECOND,
    }),
    body: text.autoStartBody,
    actions: [{ type: "button", text: text.autoStartCancel }],
  });
  notice.on("action", onCancel);
  notice.on("click", () => showWindow(win));
  notice.show();
  return () => notice.close();
}
