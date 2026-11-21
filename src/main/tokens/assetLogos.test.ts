import { describe, expect, it } from "vitest";
import { IpcErrorCode } from "../../bridge/types";
import {
  AssetLogoLimitError,
  AssetLogoStore,
  MAX_LOGO_DATA_URL_CHARS,
  MAX_LOGO_ENTRIES,
  NATIVE_ASSET_KEY,
  isLogoDataUrl,
} from "./assetLogos";

const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PNG = "data:image/png;base64,iVBORw0KGgo=";

function memoryStore(): {
  get(k: string): unknown;
  set(k: string, v: unknown): void;
} {
  const data = new Map<string, unknown>();
  return { get: (k) => data.get(k), set: (k, v) => void data.set(k, v) };
}

describe("isLogoDataUrl", () => {
  it("accepts base64 PNG and WebP only", () => {
    expect(isLogoDataUrl(PNG)).toBe(true);
    expect(isLogoDataUrl("data:image/webp;base64,UklGRg==")).toBe(true);
    expect(isLogoDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isLogoDataUrl("data:image/jpeg;base64,/9j/4A==")).toBe(false);
    expect(isLogoDataUrl("data:image/png;base64,<script>")).toBe(false);
    expect(isLogoDataUrl("https://example.com/logo.png")).toBe(false);
  });

  it("rejects a data URL above the size cap", () => {
    const huge = "data:image/png;base64," + "A".repeat(MAX_LOGO_DATA_URL_CHARS);
    expect(isLogoDataUrl(huge)).toBe(false);
  });
});

describe("AssetLogoStore", () => {
  it("stores, lists and resets a logo per asset key", () => {
    const logos = new AssetLogoStore(memoryStore());

    const other = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    logos.set(TOKEN, PNG);
    logos.set(other, PNG);
    logos.reset(TOKEN);

    expect(logos.getAll()).toEqual({ [other]: PNG });
  });

  it("refuses to save or reset the native CMU logo", () => {
    const logos = new AssetLogoStore(memoryStore());

    expect(() => logos.set(NATIVE_ASSET_KEY, PNG)).toThrow(TypeError);
    expect(() => logos.reset(NATIVE_ASSET_KEY)).toThrow(TypeError);
    expect(logos.getAll()).toEqual({});
  });

  it("drops a native logo stored before it was locked", () => {
    const store = memoryStore();
    store.set("logos", { [NATIVE_ASSET_KEY]: PNG, [TOKEN]: PNG });

    expect(new AssetLogoStore(store).getAll()).toEqual({ [TOKEN]: PNG });
  });

  it("refuses unknown keys and invalid images", () => {
    const logos = new AssetLogoStore(memoryStore());

    expect(() => logos.set("../evil", PNG)).toThrow(TypeError);
    expect(() => logos.set(TOKEN.toUpperCase(), PNG)).toThrow(TypeError);
    expect(() =>
      logos.set(TOKEN, "data:image/svg+xml;base64,PHN2Zz4="),
    ).toThrow(TypeError);
    expect(logos.getAll()).toEqual({});
  });

  it(`refuses a new key beyond ${MAX_LOGO_ENTRIES} entries but replaces an existing one`, () => {
    const logos = new AssetLogoStore(memoryStore());
    const keyOf = (i: number): string =>
      "0x" + i.toString(16).padStart(40, "0");
    for (let i = 0; i < MAX_LOGO_ENTRIES; i++) logos.set(keyOf(i), PNG);
    const other = "data:image/webp;base64,UklGRg==";

    expect(() => logos.set(TOKEN, PNG)).toThrow(AssetLogoLimitError);
    expect(() => logos.set(TOKEN, PNG)).toThrow(
      IpcErrorCode.ASSET_LOGO_LIMIT_REACHED,
    );
    logos.set(keyOf(0), other);

    expect(Object.keys(logos.getAll())).toHaveLength(MAX_LOGO_ENTRIES);
    expect(logos.getAll()[keyOf(0)]).toBe(other);
  });
});
