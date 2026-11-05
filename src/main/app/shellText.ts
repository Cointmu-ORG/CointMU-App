import type { ShellText } from "../../bridge/types";

const MAX_TEXT_LENGTH = 200;

/** English, used until the renderer sends the user's language. */
const DEFAULT_SHELL_TEXT: ShellText = {
  trayOpen: "Open CointMU",
  trayStartMining: "Start mining",
  trayStopMining: "Stop mining",
  trayQuit: "Quit",
  traySyncing: "Syncing {{percent}}%",
  traySynced: "Synced",
  trayOffline: "Node offline",
  trayMining: "Mining",
  trayNotMining: "Not mining",
  trayPeers: "{{count}} peers",
};

let current: ShellText = DEFAULT_SHELL_TEXT;
const listeners = new Set<() => void>();

/**
 * Validates a renderer payload: every key of ShellText, each a short string.
 * @param value - The payload.
 * @returns The text, or null when anything is missing or malformed.
 */
export function parseShellText(value: unknown): ShellText | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SHELL_TEXT)) {
    const text = record[key];
    if (typeof text !== "string" || text.length > MAX_TEXT_LENGTH) return null;
  }
  const picked = Object.fromEntries(
    Object.keys(DEFAULT_SHELL_TEXT).map((key) => [key, record[key]]),
  );
  return picked as unknown as ShellText;
}

/** @returns The shell text in the user's language (English until it arrives). */
export function getShellText(): ShellText {
  return current;
}

/**
 * Stores new text and tells the listeners (the tray rebuilds its menu).
 * @param text - Validated text.
 */
export function setShellText(text: ShellText): void {
  current = text;
  listeners.forEach((listener) => listener());
}

/**
 * @param listener - Called after every text change.
 * @returns Removes the listener.
 */
export function onShellTextChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Fills `{{name}}` placeholders.
 * @param template - Text with placeholders.
 * @param values - Values by name.
 * @returns The filled text; unknown placeholders stay as they are.
 */
export function fillText(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
