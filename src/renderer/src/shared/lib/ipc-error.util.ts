import i18next from "i18next";
import { IpcErrorCode } from "@bridge/types";

const IPC_ERROR_CODES = Object.values(IpcErrorCode);

/**
 * Finds the main-process error code in an IPC rejection. Electron wraps the
 * message ("Error invoking remote method …"), so the code is searched for
 * anywhere in it rather than at a fixed position.
 * @param error - The value an `ipcRenderer.invoke` call rejected with.
 * @returns The code, or null when the message carries none of ours.
 */
export function findIpcErrorCode(error: unknown): IpcErrorCode | null {
  if (!(error instanceof Error)) return null;
  return IPC_ERROR_CODES.find((code) => error.message.includes(code)) ?? null;
}

/**
 * Localizes an IPC rejection: a known code maps to `common:errors.<code>`,
 * anything else to the caller's fallback key.
 * @param error - The value an `ipcRenderer.invoke` call rejected with.
 * @param fallbackKey - Namespaced key used when no code is found.
 * @returns The user-facing message.
 */
export function localizeIpcError(error: unknown, fallbackKey: string): string {
  const code = findIpcErrorCode(error);
  return i18next.t(code ? `common:errors.${code}` : fallbackKey);
}
