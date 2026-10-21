import { app, session, type Session } from "electron";
import ms from "ms";
import {
  createTransport,
  makeElectronOfflineTransport,
} from "@sentry/electron/main";
import type {
  BaseTransportOptions,
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
} from "@sentry/core";
import { isPinnedCertificate, type PinnedCollector } from "./certificatePin";
import { filterEnvelopeItems } from "./eventAllowlist";
import type { BoundedQueue } from "./boundedQueue";

/** In-memory partition used only for telemetry, so the pin never affects other traffic. */
const TELEMETRY_PARTITION = "cointmu-telemetry";
const CERT_VERIFY_ACCEPT = 0;
const CERT_VERIFY_REJECT = -2;
const REQUEST_TIMEOUT_MS = ms("15s");
const ENVELOPE_CONTENT_TYPE = "application/x-sentry-envelope";
const HEADER_RETRY_AFTER = "retry-after";
const HEADER_RATE_LIMITS = "x-sentry-rate-limits";

let pinnedSession: Session | null = null;

/**
 * Returns the telemetry session, whose certificate check accepts only the
 * pinned collector key and rejects every other host and key.
 */
function getPinnedSession(collector: PinnedCollector): Session {
  if (pinnedSession) return pinnedSession;
  const telemetrySession = session.fromPartition(TELEMETRY_PARTITION);
  telemetrySession.setCertificateVerifyProc((request, callback) => {
    const isPinned = isPinnedCertificate(
      { hostname: request.hostname, certificatePem: request.certificate.data },
      collector,
    );
    callback(isPinned ? CERT_VERIFY_ACCEPT : CERT_VERIFY_REJECT);
  });
  pinnedSession = telemetrySession;
  return telemetrySession;
}

function makePinnedTransport(
  collector: PinnedCollector,
): (options: BaseTransportOptions) => Transport {
  return (options) =>
    createTransport(
      options,
      async (
        request: TransportRequest,
      ): Promise<TransportMakeRequestResponse> => {
        await app.whenReady();
        const response = await getPinnedSession(collector).fetch(options.url, {
          method: "POST",
          headers: { "Content-Type": ENVELOPE_CONTENT_TYPE },
          // Copied into a Buffer: fetch's BodyInit rejects SharedArrayBuffer-backed views.
          body:
            typeof request.body === "string"
              ? request.body
              : Buffer.from(request.body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        return {
          statusCode: response.status,
          headers: {
            [HEADER_RETRY_AFTER]: response.headers.get(HEADER_RETRY_AFTER),
            [HEADER_RATE_LIMITS]: response.headers.get(HEADER_RATE_LIMITS),
          },
        };
      },
    );
}

export interface TelemetryTransportOptions {
  readonly collector: PinnedCollector;
  readonly queue: BoundedQueue;
  readonly canSend: () => boolean;
}

/**
 * Builds the SDK transport: envelope items are filtered first, then the SDK's
 * offline wrapper retries with backoff, storing failed or held-back envelopes
 * in the bounded queue, and the inner request goes through the pinned session.
 * A TLS pin failure is a network error, so the envelope stays queued.
 * @param options - Collector pin, queue, and the consent gate.
 * @returns A transport factory for `Sentry.init({ transport })`.
 */
export function makeTelemetryTransport(
  options: TelemetryTransportOptions,
): (transportOptions: BaseTransportOptions) => Transport {
  const makeOffline = makeElectronOfflineTransport(
    makePinnedTransport(options.collector),
  );
  return (transportOptions) => {
    const transport = makeOffline({
      ...transportOptions,
      createStore: () => options.queue,
      flushAtStartup: true,
      shouldSend: () => options.canSend(),
    });
    return {
      send: (envelope) => {
        const filtered = filterEnvelopeItems(envelope);
        return filtered ? transport.send(filtered) : Promise.resolve({});
      },
      flush: (timeout) => transport.flush(timeout),
    };
  };
}
