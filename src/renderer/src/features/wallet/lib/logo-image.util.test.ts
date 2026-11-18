// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOGO_SIZE_PX,
  LogoFileError,
  MAX_LOGO_FILE_BYTES,
  centerSquare,
  checkLogoFile,
  reencodeLogo,
} from "./logo-image.util";

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const WEBP_HEAD = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];

const file = (bytes: number[] | string, name: string): File =>
  new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], name);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("checkLogoFile", () => {
  it("accepts PNG, JPEG and WebP by their bytes", async () => {
    expect(await checkLogoFile(file(PNG_HEAD, "a.png"))).toBeNull();
    expect(await checkLogoFile(file(JPEG_HEAD, "a.jpg"))).toBeNull();
    expect(await checkLogoFile(file(WEBP_HEAD, "a.webp"))).toBeNull();
  });

  it("rejects SVG, even named .png", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>';
    expect(await checkLogoFile(file(svg, "logo.svg"))).toBe(
      LogoFileError.UNSUPPORTED,
    );
    expect(await checkLogoFile(file(svg, "logo.png"))).toBe(
      LogoFileError.UNSUPPORTED,
    );
  });

  it("rejects a fake .png whose bytes are not an image", async () => {
    expect(
      await checkLogoFile(file("hello world, not a png", "fake.png")),
    ).toBe(LogoFileError.UNSUPPORTED);
  });

  it("rejects a file above the size limit before reading it", async () => {
    const big = new File([new Uint8Array(MAX_LOGO_FILE_BYTES + 1)], "big.png");
    expect(await checkLogoFile(big)).toBe(LogoFileError.TOO_LARGE);
  });
});

describe("centerSquare", () => {
  it("crops the middle square of a wide or tall image", () => {
    expect(centerSquare(400, 200)).toEqual({ sx: 100, sy: 0, size: 200 });
    expect(centerSquare(100, 300)).toEqual({ sx: 0, sy: 100, size: 100 });
  });
});

describe("reencodeLogo", () => {
  it("draws the center square onto a fixed-size canvas and encodes WebP", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 800, height: 600, close }),
    );
    const drawImage = vi.fn();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
      (type?: string) => `data:${type};base64,AAAA`,
    );

    const url = await reencodeLogo(file(PNG_HEAD, "a.png"));

    expect(url).toBe("data:image/webp;base64,AAAA");
    const canvas = getContext.mock.contexts[0] as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([LOGO_SIZE_PX, LOGO_SIZE_PX]);
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      100,
      0,
      600,
      600,
      0,
      0,
      LOGO_SIZE_PX,
      LOGO_SIZE_PX,
    );
    expect(close).toHaveBeenCalled();
  });
});
