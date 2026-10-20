import { describe, expect, it } from "vitest";
import {
  TelemetryConfigProblem,
  parseTelemetryConfig,
} from "./telemetryConfig";
import { CERT_A_PIN, CERT_B_PIN } from "./certificatePin.fixtures";

const DSN = "https://publickey@10.64.24.250/1";

describe("parseTelemetryConfig", () => {
  it("parses an https DSN with two pins", () => {
    const result = parseTelemetryConfig({
      dsn: DSN,
      pins: ` ${CERT_A_PIN} , ${CERT_B_PIN} `,
    });

    expect(result).toEqual({
      ok: true,
      config: {
        dsn: DSN,
        collector: { host: "10.64.24.250", pins: [CERT_A_PIN, CERT_B_PIN] },
      },
    });
  });

  it.each([undefined, "", "   "])("is disabled without a DSN (%j)", (dsn) => {
    expect(parseTelemetryConfig({ dsn, pins: CERT_A_PIN })).toEqual({
      ok: false,
      problem: TelemetryConfigProblem.MISSING,
    });
  });

  it.each([
    "http://publickey@10.64.24.250/1",
    "https://10.64.24.250/1",
    "not a url",
  ])("rejects DSN %s", (dsn) => {
    expect(parseTelemetryConfig({ dsn, pins: CERT_A_PIN })).toEqual({
      ok: false,
      problem: TelemetryConfigProblem.INVALID_DSN,
    });
  });

  it.each([undefined, "", "abc", `${CERT_A_PIN},deadbeef`])(
    "rejects pins %j",
    (pins) => {
      expect(parseTelemetryConfig({ dsn: DSN, pins })).toEqual({
        ok: false,
        problem: TelemetryConfigProblem.INVALID_PINS,
      });
    },
  );
});
