import { app, powerMonitor } from "electron";
import { join } from "node:path";
import * as Sentry from "@sentry/electron/main";
import type { Envelope, Integration } from "@sentry/core";
import type { QueuedReport } from "../../bridge/types";
import { createBoundedQueue, type BoundedQueue } from "./boundedQueue";
import { toAllowedBreadcrumb, toAllowedEvent } from "./eventAllowlist";
import { sanitizeLocal } from "./localSanitizer";
import {
  TelemetryConfigProblem,
  parseTelemetryConfig,
} from "./telemetryConfig";
import {
  UNKNOWN_CONSENT,
  canCapture,
  canSend,
  type ConsentState,
} from "./telemetryConsent";
import { makeTelemetryTransport } from "./telemetryTransport";

const QUEUE_DIR_NAME = "telemetry-queue";
const MAX_BREADCRUMBS = 30;
const MAX_VALUE_LENGTH = 1000;
const JSON_INDENT = 2;

let consent: ConsentState = UNKNOWN_CONSENT;
let queue: BoundedQueue | null = null;
let collectorHost: string | null = null;

/**
 * The only integrations that run. Breadcrumbs from console/fetch/net, local
 * variables, source context, screenshots and sessions are deliberately absent.
 */
function buildIntegrations(): Integration[] {
  return [
    Sentry.sentryMinidumpIntegration(),
    Sentry.onUncaughtExceptionIntegration(),
    Sentry.onUnhandledRejectionIntegration(),
    Sentry.childProcessIntegration(),
    Sentry.linkedErrorsIntegration(),
    Sentry.dedupeIntegration(),
    Sentry.electronContextIntegration(),
    Sentry.nodeContextIntegration({ cloudResource: false }),
    Sentry.normalizePathsIntegration(),
  ];
}

/**
 * Starts error reporting when a DSN and pin were configured at build time;
 * otherwise does nothing and the app runs with local logs only. Must run before
 * `app.whenReady()` so early crashes are caught.
 */
export function initErrorReporting(): void {
  const result = parseTelemetryConfig({
    dsn: import.meta.env.MAIN_VITE_TELEMETRY_DSN,
    pins: import.meta.env.MAIN_VITE_TELEMETRY_PINS,
  });
  if (!result.ok) {
    if (result.problem !== TelemetryConfigProblem.MISSING) {
      console.warn(`[telemetry] Reporting disabled: ${result.problem}`);
    }
    return;
  }
  const { dsn, collector } = result.config;
  const reportQueue = createBoundedQueue({
    dir: join(app.getPath("userData"), QUEUE_DIR_NAME),
  });
  queue = reportQueue;
  collectorHost = collector.host;

  Sentry.init({
    dsn,
    ipcMode: Sentry.IPCMode.Classic,
    defaultIntegrations: false,
    integrations: buildIntegrations(),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    maxBreadcrumbs: MAX_BREADCRUMBS,
    maxValueLength: MAX_VALUE_LENGTH,
    beforeSend: (event) =>
      canCapture(consent) ? toAllowedEvent(event, sanitizeLocal) : null,
    beforeBreadcrumb: (crumb) => toAllowedBreadcrumb(crumb, sanitizeLocal),
    transport: makeTelemetryTransport({
      collector,
      queue: reportQueue,
      canSend: () => canSend(consent),
    }),
  });

  void app.whenReady().then(() => {
    powerMonitor.on("resume", () => void Sentry.flush());
  });
}

/**
 * Applies the user's choice: turning reporting off empties the queue, and a
 * choice that allows sending flushes what was held back.
 * @param next - Consent read from the settings store.
 */
export function applyTelemetryConsent(next: ConsentState): void {
  consent = next;
  if (next.isEnabled === false) {
    void clearQueuedReports().catch((err: unknown) => {
      console.error("[telemetry] Failed to clear the report queue:", err);
    });
  } else if (canSend(next)) {
    void Sentry.flush();
  }
}

/** @returns Whether reporting is configured, and the collector it reports to. */
export function getTelemetryAvailability(): {
  isAvailable: boolean;
  collectorHost: string | null;
} {
  return { isAvailable: queue !== null, collectorHost };
}

function toQueuedReport(
  id: string,
  createdMs: number,
  envelope: Envelope,
): QueuedReport {
  const eventItem = envelope[1].find(([header]) => header.type === "event");
  const event = (eventItem?.[1] ?? {}) as Sentry.Event;
  const exception = event.exception?.values?.[0];
  const title =
    (exception && `${exception.type ?? "Error"}: ${exception.value ?? ""}`) ??
    event.message ??
    "";
  return {
    id,
    createdMs,
    level: event.level ?? "error",
    title,
    payload: JSON.stringify(event, null, JSON_INDENT),
  };
}

/** @returns Reports waiting to be sent, oldest first. */
export async function listQueuedReports(): Promise<QueuedReport[]> {
  if (!queue) return [];
  const queued = await queue.list();
  return queued.map(({ id, createdMs, envelope }) =>
    toQueuedReport(id, createdMs, envelope),
  );
}

/** Deletes every report waiting to be sent. */
export async function clearQueuedReports(): Promise<void> {
  await queue?.clear();
}
