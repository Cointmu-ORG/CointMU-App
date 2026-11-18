import { ipcMain } from "electron";
import { TOKEN_CHANNELS } from "../../bridge/ipc-channels";
import { getDetectedTokens } from "../tokens/detectedTokens";
import { isAddress } from "../tokens/tokenScanService";

/**
 * Registers the detected-token query. The renderer payload is validated
 * before use.
 */
export function registerTokenHandlers(): void {
  ipcMain.handle(TOKEN_CHANNELS.GET_DETECTED, (_, account: unknown) => {
    if (!isAddress(account)) {
      throw new TypeError(`${TOKEN_CHANNELS.GET_DETECTED}: invalid account`);
    }
    return getDetectedTokens(account);
  });
}
