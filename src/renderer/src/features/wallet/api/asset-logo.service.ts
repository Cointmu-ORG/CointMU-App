import type { AssetLogos } from "@bridge/types";

/** @returns Every custom logo, by asset key. */
export function getAssetLogos(): Promise<AssetLogos> {
  return window.api.assetLogos.getAll();
}

/** Saves a re-encoded PNG/WebP data URL; main validates it again. */
export function saveAssetLogo(key: string, dataUrl: string): Promise<void> {
  return window.api.assetLogos.set(key, dataUrl);
}

/** Removes the custom logo, so the asset shows its default again. */
export function resetAssetLogo(key: string): Promise<void> {
  return window.api.assetLogos.reset(key);
}
