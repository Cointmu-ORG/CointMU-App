import type { PinnedCollector } from "./certificatePin";

const SHA256_BYTES = 32;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const HTTPS_PROTOCOL = "https:";

export interface TelemetryConfig {
  readonly dsn: string;
  readonly collector: PinnedCollector;
}

export const TelemetryConfigProblem = {
  /** No DSN was configured at build time: reporting is off by design. */
  MISSING: "missing",
  INVALID_DSN: "invalid-dsn",
  INVALID_PINS: "invalid-pins",
} as const;

export type TelemetryConfigProblem =
  (typeof TelemetryConfigProblem)[keyof typeof TelemetryConfigProblem];

export type TelemetryConfigResult =
  | { readonly ok: true; readonly config: TelemetryConfig }
  | { readonly ok: false; readonly problem: TelemetryConfigProblem };

function isSpkiPin(pin: string): boolean {
  return (
    BASE64_PATTERN.test(pin) &&
    Buffer.from(pin, "base64").length === SHA256_BYTES
  );
}

function parseHttpsDsn(dsn: string): URL | null {
  try {
    const url = new URL(dsn);
    return url.protocol === HTTPS_PROTOCOL && url.username ? url : null;
  } catch {
    // Not a URL at all; reported as INVALID_DSN by the caller.
    return null;
  }
}

/**
 * Validates the telemetry settings baked in at build time. Reporting needs an
 * https DSN and at least one SPKI pin; anything else disables it.
 * @param raw - DSN and comma-separated pins as provided by the build env.
 * @returns The parsed config, or why reporting stays disabled.
 */
export function parseTelemetryConfig(raw: {
  readonly dsn?: string;
  readonly pins?: string;
}): TelemetryConfigResult {
  const dsn = raw.dsn?.trim() ?? "";
  if (!dsn) return { ok: false, problem: TelemetryConfigProblem.MISSING };
  const url = parseHttpsDsn(dsn);
  if (!url) return { ok: false, problem: TelemetryConfigProblem.INVALID_DSN };
  const pins = (raw.pins ?? "")
    .split(",")
    .map((pin) => pin.trim())
    .filter(Boolean);
  if (pins.length === 0 || !pins.every(isSpkiPin)) {
    return { ok: false, problem: TelemetryConfigProblem.INVALID_PINS };
  }
  return { ok: true, config: { dsn, collector: { host: url.hostname, pins } } };
}
