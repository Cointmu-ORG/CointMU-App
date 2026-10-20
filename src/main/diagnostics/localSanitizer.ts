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

/**
 * Sanitizes text for this machine: the generic patterns plus the OS user and
 * host name. Used for log files, clipboard log copies, and reports.
 * @param text - Input text.
 * @returns The sanitized text.
 */
export function sanitizeLocal(text: string): string {
  return sanitizeText(text, IDENTITY_LITERALS);
}
