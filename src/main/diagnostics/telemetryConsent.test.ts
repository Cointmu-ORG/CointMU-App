import { describe, expect, it } from "vitest";
import {
  TELEMETRY_ENABLED_KEY,
  TELEMETRY_NOTICE_KEY,
  UNKNOWN_CONSENT,
  canCapture,
  canSend,
  readConsent,
} from "./telemetryConsent";

function storeWith(values: Record<string, unknown>): {
  get: (key: string) => unknown;
} {
  return { get: (key) => values[key] };
}

describe("readConsent", () => {
  it("is opt-out: enabled when nothing is stored", () => {
    expect(readConsent(storeWith({}))).toEqual({
      isEnabled: true,
      isNoticeAcknowledged: false,
    });
  });

  it("is disabled only by an explicit false", () => {
    const store = storeWith({
      [TELEMETRY_ENABLED_KEY]: false,
      [TELEMETRY_NOTICE_KEY]: true,
    });

    expect(readConsent(store)).toEqual({
      isEnabled: false,
      isNoticeAcknowledged: true,
    });
  });
});

describe("consent gates", () => {
  it("queues but does not send before the store is loaded", () => {
    expect(canCapture(UNKNOWN_CONSENT)).toBe(true);
    expect(canSend(UNKNOWN_CONSENT)).toBe(false);
  });

  it("queues but does not send until the notice is acknowledged", () => {
    const consent = { isEnabled: true, isNoticeAcknowledged: false };

    expect(canCapture(consent)).toBe(true);
    expect(canSend(consent)).toBe(false);
  });

  it("sends once enabled and acknowledged", () => {
    const consent = { isEnabled: true, isNoticeAcknowledged: true };

    expect(canSend(consent)).toBe(true);
  });

  it("neither captures nor sends when turned off", () => {
    const consent = { isEnabled: false, isNoticeAcknowledged: true };

    expect(canCapture(consent)).toBe(false);
    expect(canSend(consent)).toBe(false);
  });
});
