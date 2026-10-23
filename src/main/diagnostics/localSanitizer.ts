import { hostname, userInfo } from "node:os";
import { sanitizeText } from "./sanitize";

function readIdentityLiterals(): string[] {
  try {
    return [userInfo().username, hostname()];
  } catch {
    // userInfo() throws when the account has no passwd entry; paths are still
    // scrubbed by pattern, so only the literal match is lost.
    return [hostname()];
  }
}

const IDENTITY_LITERALS = readIdentityLiterals();
const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f]+/g;
const ELLIPSIS = "…";

/**
 * Sanitizes text for this machine: the generic patterns plus the OS user and
 * host name. Used for log files, clipboard log copies, and reports.
 * @param text - Input text.
 * @returns The sanitized text.
 */
export function sanitizeLocal(text: string): string {
  return sanitizeText(text, IDENTITY_LITERALS);
}

/**
 * Sanitizes one log line for display in the UI: local sanitizing, control
 * characters collapsed to a space, and the result capped at maxChars.
 * @param line - A raw log line.
 * @param maxChars - The longest result allowed, ellipsis included.
 * @returns The display-safe line.
 */
export function sanitizeLocalLine(line: string, maxChars: number): string {
  const clean = sanitizeLocal(line).replace(CONTROL_CHARS_PATTERN, " ").trim();
  return clean.length > maxChars
    ? `${clean.slice(0, maxChars - ELLIPSIS.length)}${ELLIPSIS}`
    : clean;
}
