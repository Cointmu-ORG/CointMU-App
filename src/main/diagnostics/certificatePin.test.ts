import { describe, expect, it } from "vitest";
import { isPinnedCertificate, spkiSha256 } from "./certificatePin";
import {
  CERT_A_PEM,
  CERT_A_PIN,
  CERT_B_PEM,
  CERT_B_PIN,
} from "./certificatePin.fixtures";

const COLLECTOR = { host: "10.64.24.250", pins: [CERT_A_PIN] };

describe("spkiSha256", () => {
  it("matches the pin openssl prints for the same certificate", () => {
    expect(spkiSha256(CERT_A_PEM)).toBe(CERT_A_PIN);
    expect(spkiSha256(CERT_B_PEM)).toBe(CERT_B_PIN);
  });
});

describe("isPinnedCertificate", () => {
  it("accepts the collector host serving a pinned key", () => {
    const presented = { hostname: COLLECTOR.host, certificatePem: CERT_A_PEM };

    expect(isPinnedCertificate(presented, COLLECTOR)).toBe(true);
  });

  it("rejects a different key on the same IP (another machine on another network)", () => {
    const presented = { hostname: COLLECTOR.host, certificatePem: CERT_B_PEM };

    expect(isPinnedCertificate(presented, COLLECTOR)).toBe(false);
  });

  it("rejects the pinned key on a host other than the collector", () => {
    const presented = { hostname: "10.0.0.9", certificatePem: CERT_A_PEM };

    expect(isPinnedCertificate(presented, COLLECTOR)).toBe(false);
  });

  it("accepts either key while a rotation pin is shipped", () => {
    const rotating = { ...COLLECTOR, pins: [CERT_A_PIN, CERT_B_PIN] };
    const presented = { hostname: COLLECTOR.host, certificatePem: CERT_B_PEM };

    expect(isPinnedCertificate(presented, rotating)).toBe(true);
  });

  it("rejects a malformed certificate", () => {
    const presented = {
      hostname: COLLECTOR.host,
      certificatePem:
        "-----BEGIN CERTIFICATE-----\nnope\n-----END CERTIFICATE-----",
    };

    expect(isPinnedCertificate(presented, COLLECTOR)).toBe(false);
  });

  it("rejects everything when no pins are configured", () => {
    const presented = { hostname: COLLECTOR.host, certificatePem: CERT_A_PEM };

    expect(isPinnedCertificate(presented, { ...COLLECTOR, pins: [] })).toBe(
      false,
    );
  });
});
