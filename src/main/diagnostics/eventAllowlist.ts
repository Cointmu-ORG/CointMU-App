import type {
  Breadcrumb,
  Envelope,
  ErrorEvent,
  Exception,
  StackFrame,
} from "@sentry/core";

/** Breadcrumb categories CointMU records itself; nothing else is kept. */
export const BreadcrumbCategory = {
  GETH: "geth",
  RECOVERY: "recovery",
} as const;

export const ReportTag = {
  PROCESS: "event.process",
  ENVIRONMENT: "event.environment",
  GETH_KIND: "geth.kind",
  RECOVERY_STAGE: "recovery.stage",
} as const;

const ALLOWED_BREADCRUMB_CATEGORIES: ReadonlySet<string> = new Set(
  Object.values(BreadcrumbCategory),
);
const ALLOWED_TAGS: readonly string[] = Object.values(ReportTag);
const CRASHPAD_PROCESS_TYPE = "crashpad.process_type";
const ENVELOPE_ITEM_EVENT = "event";

type Sanitize = (text: string) => string;
type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | undefined {
  return typeof value === "object" && value !== null
    ? (value as Dict)
    : undefined;
}

function pickStrings(
  source: unknown,
  keys: readonly string[],
  sanitize: Sanitize,
): Dict | undefined {
  const dict = asDict(source);
  if (!dict) return undefined;
  const picked: Dict = {};
  for (const key of keys) {
    const value = dict[key];
    if (typeof value === "string") picked[key] = sanitize(value);
    else if (typeof value === "number" || typeof value === "boolean")
      picked[key] = value;
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
}

function toAllowedFrame(frame: StackFrame, sanitize: Sanitize): StackFrame {
  return {
    filename: frame.filename && sanitize(frame.filename),
    function: frame.function && sanitize(frame.function),
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
  };
}

function toAllowedException(
  exception: Exception,
  sanitize: Sanitize,
): Exception {
  const frames = exception.stacktrace?.frames;
  return {
    type: exception.type && sanitize(exception.type),
    value: exception.value && sanitize(exception.value),
    mechanism: exception.mechanism && {
      type: exception.mechanism.type,
      handled: exception.mechanism.handled,
    },
    stacktrace: frames && {
      frames: frames.map((frame) => toAllowedFrame(frame, sanitize)),
    },
  };
}

/**
 * Keeps only breadcrumbs CointMU records itself, with a sanitized message.
 * @param crumb - Candidate breadcrumb.
 * @param sanitize - Text sanitizer.
 * @returns The reduced breadcrumb, or null to drop it.
 */
export function toAllowedBreadcrumb(
  crumb: Breadcrumb,
  sanitize: Sanitize,
): Breadcrumb | null {
  if (!crumb.category || !ALLOWED_BREADCRUMB_CATEGORIES.has(crumb.category)) {
    return null;
  }
  return {
    timestamp: crumb.timestamp,
    category: crumb.category,
    level: crumb.level,
    message: crumb.message && sanitize(crumb.message),
  };
}

function toAllowedContexts(
  contexts: ErrorEvent["contexts"],
  sanitize: Sanitize,
): ErrorEvent["contexts"] {
  const electron = asDict(contexts?.electron);
  const details = pickStrings(
    electron?.details,
    ["type", "reason", "exitCode"],
    sanitize,
  );
  const crashpad = pickStrings(electron, [CRASHPAD_PROCESS_TYPE], sanitize);
  return {
    os: pickStrings(contexts?.os, ["name", "version"], sanitize),
    app: pickStrings(contexts?.app, ["app_version", "app_arch"], sanitize),
    runtime: pickStrings(contexts?.runtime, ["name", "version"], sanitize),
    ...(details || crashpad
      ? { electron: { ...crashpad, ...(details && { details }) } }
      : {}),
  };
}

/**
 * Rebuilds an event from an allowlist of fields, sanitizing every string.
 * Anything not listed here (user, request, extra, server_name, modules, device,
 * debug_meta, ...) is dropped, including fields a future SDK might add.
 * @param event - Event produced by the SDK.
 * @param sanitize - Text sanitizer.
 * @returns A new event holding only allowlisted data.
 */
export function toAllowedEvent(
  event: ErrorEvent,
  sanitize: Sanitize,
): ErrorEvent {
  const crumbs = (event.breadcrumbs ?? [])
    .map((crumb) => toAllowedBreadcrumb(crumb, sanitize))
    .filter((crumb): crumb is Breadcrumb => crumb !== null);
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform,
    release: event.release,
    dist: event.dist,
    environment: event.environment,
    sdk: event.sdk && { name: event.sdk.name, version: event.sdk.version },
    message: event.message && sanitize(event.message),
    exception: event.exception?.values && {
      values: event.exception.values.map((value) =>
        toAllowedException(value, sanitize),
      ),
    },
    tags: pickStrings(event.tags, ALLOWED_TAGS, sanitize) as ErrorEvent["tags"],
    contexts: toAllowedContexts(event.contexts, sanitize),
    breadcrumbs: crumbs,
    fingerprint: event.fingerprint?.map(sanitize),
  };
}

/**
 * Keeps only error event items in an envelope. Attachments (minidumps), logs,
 * spans, sessions and feedback are dropped, including those sent through paths
 * that skip `beforeSend`.
 * @param envelope - Outgoing envelope.
 * @returns The filtered envelope, or null when nothing is left to send.
 */
export function filterEnvelopeItems(envelope: Envelope): Envelope | null {
  const [headers, items] = envelope;
  const kept = items.filter(([item]) => item.type === ENVELOPE_ITEM_EVENT);
  if (kept.length === 0) return null;
  return [headers, kept] as Envelope;
}
