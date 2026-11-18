/** Largest source file accepted for a logo upload. */
export const MAX_LOGO_FILE_BYTES = 2 * 1024 * 1024;
/** Logos are stored as a square of this many pixels. */
export const LOGO_SIZE_PX = 128;
const WEBP_QUALITY = 0.9;
const SNIFF_BYTES = 12;

/** Why a picked file cannot be used as a logo. */
export const LogoFileError = {
  TOO_LARGE: "tooLarge",
  UNSUPPORTED: "unsupported",
  UNREADABLE: "unreadable",
} as const;
export type LogoFileError = (typeof LogoFileError)[keyof typeof LogoFileError];

export type LogoImageFormat = "png" | "jpeg" | "webp";

const startsWith = (
  bytes: Uint8Array,
  prefix: readonly number[],
  at = 0,
): boolean => prefix.every((byte, i) => bytes[at + i] === byte);

/**
 * Identifies an image from its first bytes, not its name or MIME type.
 * SVG (text, may carry script) and everything else return null.
 * @param bytes - At least the first 12 bytes of the file.
 * @returns The format, or null when it is not PNG, JPEG or WebP.
 */
export function detectImageFormat(bytes: Uint8Array): LogoImageFormat | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  const RIFF = [0x52, 0x49, 0x46, 0x46];
  const WEBP = [0x57, 0x45, 0x42, 0x50];
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "webp";
  return null;
}

/**
 * Checks size and content of a picked file before it is decoded.
 * @param file - The file the user picked.
 * @returns The problem, or null when the file can be decoded.
 */
export async function checkLogoFile(file: Blob): Promise<LogoFileError | null> {
  if (file.size > MAX_LOGO_FILE_BYTES) return LogoFileError.TOO_LARGE;
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  return detectImageFormat(head) === null ? LogoFileError.UNSUPPORTED : null;
}

/**
 * @param width - Source width.
 * @param height - Source height.
 * @returns The largest centered square of the source.
 */
export function centerSquare(
  width: number,
  height: number,
): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return { sx: (width - size) / 2, sy: (height - size) / 2, size };
}

/**
 * Decodes the image and draws its centered square onto a fixed
 * LOGO_SIZE_PX canvas, then encodes WebP (PNG where WebP is unavailable).
 * Re-encoding drops metadata such as EXIF/GPS and keeps the data URL small.
 * @param file - A file that passed checkLogoFile.
 * @returns The data URL to preview and save.
 * @throws When the browser cannot decode the image.
 */
export async function reencodeLogo(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = LOGO_SIZE_PX;
    canvas.height = LOGO_SIZE_PX;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("2D canvas unavailable");
    const { sx, sy, size } = centerSquare(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      sx,
      sy,
      size,
      size,
      0,
      0,
      LOGO_SIZE_PX,
      LOGO_SIZE_PX,
    );
    const webp = canvas.toDataURL("image/webp", WEBP_QUALITY);
    return webp.startsWith("data:image/webp")
      ? webp
      : canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}
