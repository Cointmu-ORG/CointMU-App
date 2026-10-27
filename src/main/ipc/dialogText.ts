import type { DialogText } from "../../bridge/types";

/** Longer than any dialog title we ship in any locale. */
const MAX_DIALOG_TEXT_LENGTH = 200;

function pickText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  if (!text || text.length > MAX_DIALOG_TEXT_LENGTH) return fallback;
  return text;
}

/**
 * Validates dialog text that came from the renderer, falling back field by
 * field to the English default when a field is missing, empty or too long.
 * @param input - The untrusted value from the IPC call.
 * @param fallback - The English text main uses on its own.
 * @returns Text that is safe to hand to Electron's dialog.
 */
export function resolveDialogText(
  input: unknown,
  fallback: DialogText,
): DialogText {
  const fields =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  return {
    title: pickText(fields.title, fallback.title),
    filterName: pickText(fields.filterName, fallback.filterName),
  };
}
