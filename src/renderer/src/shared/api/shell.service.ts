import type { ShellCapabilities, ShellText } from "@bridge/types";

const NO_CAPABILITIES: ShellCapabilities = { isTraySupported: false };

/**
 * Sends the tray text in the current language to the main process.
 * @param text - Localized shell text.
 * @returns Resolves once stored; rejects when main refuses the payload.
 */
function setShellText(text: ShellText): Promise<void> {
  return window.api.shell.setText(text);
}

/**
 * @returns What the desktop supports; no tray when the bridge fails.
 */
async function getShellCapabilities(): Promise<ShellCapabilities> {
  try {
    return await window.api.shell.getCapabilities();
  } catch (err) {
    console.error("Failed to read shell capabilities", err);
    return NO_CAPABILITIES;
  }
}

export { setShellText, getShellCapabilities };
