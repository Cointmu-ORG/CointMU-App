import { ipcMain } from "electron";
import { ASSET_LOGO_CHANNELS, TOKEN_CHANNELS } from "../../bridge/ipc-channels";
import { AssetLogoStore } from "../tokens/assetLogos";
import { getDetectedNfts, getDetectedTokens } from "../tokens/detectedTokens";
import { isNftUri, loadNftMedia } from "../tokens/nftMedia";
import { isAddress } from "../tokens/tokenScanService";

/**
 * Registers the detected-token and detected-NFT queries and the custom asset logo store.
 * Every renderer payload is validated before use.
 */
export async function registerTokenHandlers(): Promise<void> {
  ipcMain.handle(TOKEN_CHANNELS.GET_DETECTED, (_, account: unknown) => {
    if (!isAddress(account)) {
      throw new TypeError(`${TOKEN_CHANNELS.GET_DETECTED}: invalid account`);
    }
    return getDetectedTokens(account);
  });
  ipcMain.handle(TOKEN_CHANNELS.GET_DETECTED_NFTS, (_, account: unknown) => {
    if (!isAddress(account)) {
      throw new TypeError(
        `${TOKEN_CHANNELS.GET_DETECTED_NFTS}: invalid account`,
      );
    }
    return getDetectedNfts(account);
  });
  ipcMain.handle(TOKEN_CHANNELS.FETCH_NFT_MEDIA, (_, tokenUri: unknown) => {
    if (!isNftUri(tokenUri)) {
      throw new TypeError(`${TOKEN_CHANNELS.FETCH_NFT_MEDIA}: invalid URI`);
    }
    return loadNftMedia(tokenUri);
  });

  const { default: Store } = await import("electron-store");
  const logos = new AssetLogoStore(new Store({ name: "asset-logos" }));
  ipcMain.handle(ASSET_LOGO_CHANNELS.GET_ALL, () => logos.getAll());
  ipcMain.handle(ASSET_LOGO_CHANNELS.SET, (_, key: unknown, url: unknown) =>
    logos.set(key, url),
  );
  ipcMain.handle(ASSET_LOGO_CHANNELS.RESET, (_, key: unknown) =>
    logos.reset(key),
  );
}
