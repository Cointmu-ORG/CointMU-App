import { IpcErrorCode, type AssetLogos } from "../../bridge/types";

export const NATIVE_ASSET_KEY = "native";
/**
 * The renderer re-encodes logos to 128x128 PNG/WebP (a few KB to ~40 KB);
 * this cap only stops a payload far above that.
 */
export const MAX_LOGO_DATA_URL_CHARS = 120_000;
/** Custom logos kept at most; asset keys are any token address, so the file is capped. */
export const MAX_LOGO_ENTRIES = 250;
const LOGO_DATA_URL = /^data:image\/(png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const CONTRACT_ADDRESS = /^0x[0-9a-f]{40}$/;
const LOGOS_KEY = "logos";

/** The part of electron-store the logo store uses. */
interface KeyValueStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

/** @returns True for "native" or a lowercase contract address. */
export function isAssetKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value === NATIVE_ASSET_KEY || CONTRACT_ADDRESS.test(value))
  );
}

/** @returns True for a base64 PNG or WebP data URL within the size cap. */
export function isLogoDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_LOGO_DATA_URL_CHARS &&
    LOGO_DATA_URL.test(value)
  );
}

/** Saving a logo for a new asset would exceed MAX_LOGO_ENTRIES. */
export class AssetLogoLimitError extends Error {
  override readonly name = "AssetLogoLimitError";
  constructor() {
    // The message is the code: Electron passes only the message to the renderer.
    super(IpcErrorCode.ASSET_LOGO_LIMIT_REACHED);
  }
}

/**
 * Custom asset logos, kept locally in their own electron-store file and
 * never sent anywhere. Every write is validated here, not trusted from the renderer.
 */
export class AssetLogoStore {
  constructor(private readonly store: KeyValueStore) {}

  getAll(): AssetLogos {
    const logos = this.store.get(LOGOS_KEY);
    if (typeof logos !== "object" || logos === null) return {};
    return Object.fromEntries(
      Object.entries(logos).filter(
        ([key, url]) => isAssetKey(key) && isLogoDataUrl(url),
      ),
    );
  }

  /**
   * @throws {TypeError} On an unknown key or an invalid data URL.
   * @throws {AssetLogoLimitError} On a new key when MAX_LOGO_ENTRIES are stored.
   */
  set(key: unknown, dataUrl: unknown): void {
    if (!isAssetKey(key)) throw new TypeError("asset logo: invalid asset key");
    if (!isLogoDataUrl(dataUrl)) {
      throw new TypeError("asset logo: expected a PNG/WebP data URL");
    }
    const logos = this.getAll();
    if (!(key in logos) && Object.keys(logos).length >= MAX_LOGO_ENTRIES) {
      throw new AssetLogoLimitError();
    }
    this.store.set(LOGOS_KEY, { ...logos, [key]: dataUrl });
  }

  /** @throws {TypeError} On an unknown key. */
  reset(key: unknown): void {
    if (!isAssetKey(key)) throw new TypeError("asset logo: invalid asset key");
    const { [key]: _removed, ...rest } = this.getAll();
    this.store.set(LOGOS_KEY, rest);
  }
}
