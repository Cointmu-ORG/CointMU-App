import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage, RequestOptions } from "node:http";
import { isIP } from "node:net";
import { isBlockedAddress } from "./addressPolicy";

/**
 * GET over https to public hosts only. Every hop (the first URL and each
 * redirect) is resolved here, refused if any address is non-public, and the
 * socket connects to an address from that same lookup, so a DNS answer that
 * changes between check and connect (rebinding) cannot reach a private host.
 */

export const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 399;

/** Why a URL was not fetched. */
export class PublicFetchError extends Error {
  override readonly name = "PublicFetchError";
}

export interface ResolvedAddress {
  readonly address: string;
  readonly family: number;
}
export type Resolve = (hostname: string) => Promise<ResolvedAddress[]>;
export type Request = (
  options: RequestOptions,
  onResponse: (response: IncomingMessage) => void,
) => {
  on(event: "error", listener: (err: Error) => void): unknown;
  end(): unknown;
};

/** The real DNS and https; tests pass fakes. */
export interface Transport {
  readonly resolve: Resolve;
  readonly request: Request;
}

export const nodeTransport: Transport = {
  resolve: (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
  request: httpsRequest,
};

/**
 * @returns The host's addresses, all public.
 * @throws {PublicFetchError} When the host has no address or any is non-public.
 */
export async function publicAddresses(
  hostname: string,
  resolve: Resolve,
): Promise<ResolvedAddress[]> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  const family = isIP(bare);
  const addresses =
    family === 0 ? await resolve(bare) : [{ address: bare, family }];
  if (addresses.length === 0) {
    throw new PublicFetchError(`${hostname}: no address`);
  }
  const bad = addresses.find((a) => isBlockedAddress(a.address));
  if (bad !== undefined) {
    throw new PublicFetchError(
      `${hostname}: non-public address ${bad.address}`,
    );
  }
  return addresses;
}

function requireHttps(url: URL): void {
  if (url.protocol !== "https:") {
    throw new PublicFetchError(`unsupported scheme ${url.protocol}`);
  }
}

/** One GET whose socket can only connect to the checked addresses. */
async function getOnce(
  url: URL,
  transport: Transport,
): Promise<IncomingMessage> {
  requireHttps(url);
  const addresses = await publicAddresses(url.hostname, transport.resolve);
  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        method: "GET",
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        // Pinned: hand back the addresses checked above, never a fresh lookup.
        lookup: (_host, options, callback) => {
          const first = addresses[0];
          if ((options as { all?: boolean }).all) {
            (callback as (e: null, a: ResolvedAddress[]) => void)(
              null,
              addresses,
            );
          } else callback(null, first.address, first.family);
        },
      },
      resolve,
    );
    req.on("error", reject);
    req.end();
  });
}

/** Reads the body, stopping as soon as it passes maxBytes. */
async function readCapped(
  response: IncomingMessage,
  maxBytes: number,
): Promise<Uint8Array> {
  if (Number(response.headers["content-length"] ?? 0) > maxBytes) {
    response.destroy();
    throw new PublicFetchError("too large");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response as AsyncIterable<Buffer>) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      response.destroy();
      throw new PublicFetchError("too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * @param url - An https URL.
 * @param maxBytes - Body size cap.
 * @param transport - DNS and https; the real ones unless testing.
 * @returns The body and its media type (lowercase, no parameters).
 * @throws {PublicFetchError} On a non-https or non-public hop, an HTTP error,
 *   too many redirects or an oversize body.
 */
export async function fetchPublicHttps(
  url: URL,
  maxBytes: number,
  transport: Transport = nodeTransport,
): Promise<{ type: string; bytes: Uint8Array }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await getOnce(current, transport);
    const status = response.statusCode ?? 0;
    if (status >= HTTP_REDIRECT_MIN && status <= HTTP_REDIRECT_MAX) {
      response.resume();
      current = new URL(response.headers.location ?? "", current);
      continue;
    }
    if (status < HTTP_OK_MIN || status > HTTP_OK_MAX) {
      response.resume();
      throw new PublicFetchError(`HTTP ${status}`);
    }
    const type = (response.headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    return { type, bytes: await readCapped(response, maxBytes) };
  }
  throw new PublicFetchError("too many redirects");
}
