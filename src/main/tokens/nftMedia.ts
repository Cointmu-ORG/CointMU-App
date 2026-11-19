import type { NftMedia } from "../../bridge/types";
import { sanitizeTokenText } from "./erc20Calls";
import { fetchPublicHttps, nodeTransport, type Transport } from "./publicHttps";

// NFT metadata and images are fetched here, not in the renderer, so the CSP
// keeps img-src to 'self' data: blob:. Network hops go through
// fetchPublicHttps, which refuses non-public addresses (SSRF guard).

export const IPFS_GATEWAY = "https://ipfs.io/ipfs/";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_METADATA_BYTES = 256 * 1024;
/** Total data URL characters kept in memory; the oldest entries go first. */
export const MAX_CACHE_CHARS = 32 * 1024 * 1024;
const MAX_NAME_CHARS = 100;
const MAX_DESCRIPTION_CHARS = 1_000;

const ImageType = {
  PNG: "image/png",
  JPEG: "image/jpeg",
  GIF: "image/gif",
  WEBP: "image/webp",
  SVG: "image/svg+xml",
} as const;
type ImageType = (typeof ImageType)[keyof typeof ImageType];

const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  prefix.every((byte, i) => bytes[at + i] === byte);
const ascii = (text: string): number[] =>
  Array.from(text, (c) => c.charCodeAt(0));
const WEBP_TAG_OFFSET = 8;

/** Whether the bytes are the image type they claim to be. */
const MAGIC: Record<ImageType, (bytes: Uint8Array) => boolean> = {
  [ImageType.PNG]: (b) =>
    startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  [ImageType.JPEG]: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  [ImageType.GIF]: (b) =>
    startsWith(b, ascii("GIF87a")) || startsWith(b, ascii("GIF89a")),
  [ImageType.WEBP]: (b) =>
    startsWith(b, ascii("RIFF")) &&
    startsWith(b, ascii("WEBP"), WEBP_TAG_OFFSET),
  // Only ever shown through <img>, where SVG scripts do not run.
  [ImageType.SVG]: (b) => new TextDecoder().decode(b).includes("<svg"),
};

/** Why a URI was not fetched or its content refused. */
export class NftMediaError extends Error {
  override readonly name = "NftMediaError";
}

const cache = new Map<string, NftMedia>();
let cachedChars = 0;

function remember(uri: string, media: NftMedia): NftMedia {
  cache.set(uri, media);
  cachedChars += media.image.length;
  for (const [oldest, old] of cache) {
    if (cachedChars <= MAX_CACHE_CHARS) break;
    cache.delete(oldest);
    cachedChars -= old.image.length;
  }
  return media;
}

/** @returns An https URL for an ipfs:// or https:// URI; throws on anything else. */
export function toHttpsUrl(uri: string): URL {
  const resolved = uri.startsWith("ipfs://")
    ? IPFS_GATEWAY + uri.slice("ipfs://".length).replace(/^ipfs\//, "")
    : uri;
  const url = new URL(resolved);
  if (url.protocol !== "https:") {
    throw new NftMediaError(`unsupported scheme ${url.protocol}`);
  }
  return url;
}

/** Splits a data: URI into its media type and decoded bytes. */
function decodeDataUri(uri: string): { type: string; bytes: Uint8Array } {
  const match = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(uri);
  if (match === null) throw new NftMediaError("invalid data URI");
  const [, type, params, payload] = match;
  const bytes = params.includes(";base64")
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload));
  return { type: type.toLowerCase(), bytes };
}

async function loadBytes(
  uri: string,
  maxBytes: number,
  transport: Transport,
): Promise<{ type: string; bytes: Uint8Array }> {
  if (uri.startsWith("data:")) {
    const decoded = decodeDataUri(uri);
    if (decoded.bytes.byteLength > maxBytes) {
      throw new NftMediaError("too large");
    }
    return decoded;
  }
  return fetchPublicHttps(toHttpsUrl(uri), maxBytes, transport);
}

/**
 * @param uri - An image URI from NFT metadata (https, ipfs or data:).
 * @returns The image as a data URL, or "" when it is not an allowed image.
 */
export async function loadNftImage(
  uri: string,
  transport: Transport = nodeTransport,
): Promise<string> {
  const { type, bytes } = await loadBytes(uri, MAX_IMAGE_BYTES, transport);
  const imageType = (type === "image/jpg" ? ImageType.JPEG : type) as ImageType;
  if (!(imageType in MAGIC) || !MAGIC[imageType](bytes)) {
    throw new NftMediaError(`not an allowed image (${type})`);
  }
  return `data:${imageType};base64,${Buffer.from(bytes).toString("base64")}`;
}

const textField = (value: unknown, maxChars: number): string =>
  typeof value === "string" ? sanitizeTokenText(value, maxChars) : "";

/**
 * Loads an NFT's metadata JSON and its image. Each step that fails leaves
 * its fields empty instead of failing the whole token.
 * @param tokenUri - The tokenURI the contract returned.
 * @param transport - DNS and https; the real ones unless testing.
 * @returns Cleaned name and description, and the image as a data URL.
 */
export async function loadNftMedia(
  tokenUri: string,
  transport: Transport = nodeTransport,
): Promise<NftMedia> {
  const hit = cache.get(tokenUri);
  if (hit !== undefined) return hit;
  const { bytes } = await loadBytes(tokenUri, MAX_METADATA_BYTES, transport);
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const fields = (typeof json === "object" && json !== null ? json : {}) as {
    name?: unknown;
    description?: unknown;
    image?: unknown;
  };
  let image = "";
  if (typeof fields.image === "string" && fields.image !== "") {
    try {
      image = await loadNftImage(fields.image, transport);
    } catch (err) {
      console.warn("[nft] Image not loaded:", (err as Error).message);
    }
  }
  return remember(tokenUri, {
    name: textField(fields.name, MAX_NAME_CHARS),
    description: textField(fields.description, MAX_DESCRIPTION_CHARS),
    image,
  });
}
