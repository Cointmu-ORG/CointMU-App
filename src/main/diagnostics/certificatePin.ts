import { X509Certificate, createHash } from "node:crypto";

/** The collector a telemetry request may reach, and the public keys it may present. */
export interface PinnedCollector {
  readonly host: string;
  /** Base64 SHA-256 of the DER SubjectPublicKeyInfo, as printed by `openssl ... | base64`. */
  readonly pins: readonly string[];
}

export interface PresentedCertificate {
  readonly hostname: string;
  /** PEM, as Electron's `Certificate.data`. */
  readonly certificatePem: string;
}

/**
 * Computes the SPKI pin of a certificate.
 * @param pem - PEM-encoded X.509 certificate.
 * @returns Base64 SHA-256 of the DER-encoded public key.
 * @throws When the PEM is not a valid certificate.
 */
export function spkiSha256(pem: string): string {
  const spki = new X509Certificate(pem).publicKey.export({
    type: "spki",
    format: "der",
  });
  return createHash("sha256").update(spki).digest("base64");
}

/**
 * Decides whether a TLS peer is the pinned collector. The pin replaces CA
 * validation, so a self-signed or internal-CA certificate is accepted only when
 * its key matches, and a different machine on the same IP is rejected.
 * @param presented - Hostname being connected to and the certificate it served.
 * @param collector - Expected host and allowed key pins.
 * @returns True only for the collector host serving a pinned key.
 */
export function isPinnedCertificate(
  presented: PresentedCertificate,
  collector: PinnedCollector,
): boolean {
  if (presented.hostname !== collector.host) return false;
  let pin: string;
  try {
    pin = spkiSha256(presented.certificatePem);
  } catch {
    // An unparsable certificate is simply not the pinned one.
    return false;
  }
  return collector.pins.includes(pin);
}
