import { X509Certificate, createPrivateKey } from "node:crypto";
import {
  CertificateExpiredError,
  CertificateNotYetValidError,
  MtlsCertificateError,
} from "./errors";

/**
 * Client-certificate parsing + validity checks for the mTLS transport.
 *
 * Provider-neutral. First consumer: ADP, whose WS certificate must be presented
 * on every request and whose expiry the app must validate up-front (a silently
 * expired cert would otherwise fail every ADP call with an opaque TLS error).
 *
 * NO-LEAK: the returned `ClientCertificateInfo` contains only NON-SENSITIVE
 * identifying metadata (subject, issuer, serial, validity window, SHA-256
 * fingerprint). It never contains the private key. The fingerprint + subject are
 * safe to store for display/audit and to log; the PEM itself is not handled here
 * beyond parsing.
 */

export interface ClientCertificateInfo {
  /** RFC 2253-ish subject DN string, e.g. "CN=acme, O=Acme Inc". */
  subject: string;
  /** Issuer DN string (self-signed certs echo the subject). */
  issuer: string;
  /** Hex serial number. */
  serialNumber: string;
  /** ISO-8601 notBefore. */
  validFrom: string;
  /** ISO-8601 notAfter. */
  validTo: string;
  /** Colon-separated SHA-256 fingerprint — a stable, non-sensitive id. */
  fingerprint256: string;
}

/** Parse the X509 `validFrom`/`validTo` string (e.g. "Jul 18 01:51:49 2026 GMT"). */
function toIso(x509Date: string): string {
  const d = new Date(x509Date);
  if (Number.isNaN(d.getTime())) {
    throw new MtlsCertificateError(
      "certificate_parse_failed",
      "Could not parse certificate validity dates.",
    );
  }
  return d.toISOString();
}

/**
 * Parse a PEM certificate into non-sensitive metadata. Throws
 * `MtlsCertificateError('certificate_parse_failed')` on malformed input — the
 * message NEVER echoes the input.
 */
export function parseClientCertificate(certPem: string): ClientCertificateInfo {
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch {
    throw new MtlsCertificateError(
      "certificate_parse_failed",
      "The client certificate could not be parsed (expected a PEM X.509 certificate).",
    );
  }
  return {
    subject: cert.subject.replace(/\n/g, ", "),
    issuer: cert.issuer.replace(/\n/g, ", "),
    serialNumber: cert.serialNumber,
    validFrom: toIso(cert.validFrom),
    validTo: toIso(cert.validTo),
    fingerprint256: cert.fingerprint256,
  };
}

/**
 * Assert that the private key PEM pairs with the certificate PEM. Throws
 * `MtlsCertificateError('private_key_parse_failed')` if the key is unreadable,
 * or `('key_certificate_mismatch')` if it does not match the cert. Used at
 * connect time so a user cannot store a mismatched cert/key pair that would fail
 * every subsequent request with an opaque handshake error.
 *
 * NO-LEAK: neither PEM is echoed in any thrown message.
 */
export function assertKeyMatchesCertificate(certPem: string, keyPem: string): void {
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch {
    throw new MtlsCertificateError(
      "certificate_parse_failed",
      "The client certificate could not be parsed (expected a PEM X.509 certificate).",
    );
  }
  let key;
  try {
    key = createPrivateKey(keyPem);
  } catch {
    throw new MtlsCertificateError(
      "private_key_parse_failed",
      "The private key could not be parsed (expected an unencrypted PEM private key).",
    );
  }
  let matches = false;
  try {
    matches = cert.checkPrivateKey(key);
  } catch {
    matches = false;
  }
  if (!matches) {
    throw new MtlsCertificateError(
      "key_certificate_mismatch",
      "The private key does not match the client certificate.",
    );
  }
}

/**
 * Assert the certificate is within its validity window at `now`. Throws
 * `CertificateNotYetValidError` / `CertificateExpiredError` (both carry only the
 * boundary date, never the PEM). Returns the parsed info on success.
 *
 * `now` is injectable so callers/tests are deterministic; defaults to the
 * current time. (Note: the Date.now ban only applies to Workflow-tool scripts,
 * not application code — but injection keeps this unit-testable against a single
 * fixture cert.)
 */
export function assertCertificateCurrentlyValid(
  certPem: string,
  now: Date = new Date(),
): ClientCertificateInfo {
  const info = parseClientCertificate(certPem);
  const t = now.getTime();
  if (t < new Date(info.validFrom).getTime()) {
    throw new CertificateNotYetValidError(info.validFrom);
  }
  if (t > new Date(info.validTo).getTime()) {
    throw new CertificateExpiredError(info.validTo);
  }
  return info;
}

/**
 * True when the certificate expires within `withinMs` of `now` (or is already
 * expired). Drives proactive rotation warnings ("your ADP certificate expires in
 * N days") WITHOUT failing the request. Returns `{ expiring, validTo }`.
 */
export function certificateExpiringWithin(
  certPem: string,
  withinMs: number,
  now: Date = new Date(),
): { expiring: boolean; validTo: string } {
  const info = parseClientCertificate(certPem);
  const expiring = now.getTime() + withinMs >= new Date(info.validTo).getTime();
  return { expiring, validTo: info.validTo };
}
