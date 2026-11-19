import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import type { Transport } from "./publicHttps";

export interface FakeResponse {
  readonly status?: number;
  readonly headers?: Record<string, string>;
  readonly body?: string | Uint8Array;
}

/**
 * Fake DNS and https for fetchPublicHttps. Responses are keyed by URL href;
 * `connected` records the address each request's pinned lookup returned.
 */
export function fakeTransport(
  dns: Record<string, readonly string[]>,
  responses: Record<string, FakeResponse>,
) {
  const connected: string[] = [];
  const resolved: string[] = [];
  const transport: Transport = {
    resolve: async (hostname) => {
      resolved.push(hostname);
      return (dns[hostname] ?? []).map((address) => ({
        address,
        family: isIP(address),
      }));
    },
    request: (options, onResponse) => {
      const req = new EventEmitter() as EventEmitter & { end(): void };
      req.end = () =>
        options.lookup?.(options.hostname ?? "", {}, (err, address) => {
          if (err) return void req.emit("error", err);
          connected.push(String(address));
          const host =
            isIP(options.hostname ?? "") === 6
              ? `[${options.hostname}]`
              : options.hostname;
          const href = `https://${host}${options.port ? `:${options.port}` : ""}${options.path}`;
          const fake = responses[href];
          if (fake === undefined) {
            return void req.emit("error", new Error(`no route ${href}`));
          }
          const res = Object.assign(
            Readable.from([Buffer.from(fake.body ?? "")]),
            { statusCode: fake.status ?? 200, headers: fake.headers ?? {} },
          );
          onResponse(res as unknown as IncomingMessage);
        });
      return req;
    },
  };
  return { transport, connected, resolved };
}
