import { describe, expect, it } from "vitest";
import {
  AssetLogoStore,
  MAX_LOGO_DATA_URL_CHARS,
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

    logos.set(TOKEN, PNG);
    logos.set("native", PNG);
    logos.reset(TOKEN);

    expect(logos.getAll()).toEqual({ native: PNG });
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
});
