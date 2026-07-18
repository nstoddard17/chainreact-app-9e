/**
 * Typed, REDACTED errors for the server-side mutual-TLS transport.
 *
 * Provider-neutral infrastructure (first consumer: ADP, which requires a client
 * certificate + private key on every request). These errors are the ONLY thing
 * the transport surfaces to callers, so they are the no-leak boundary:
 *
 *   - NEVER embed the certificate PEM, private key PEM, request/response body,
 *     Authorization header, or any credential material in a message.
 *   - A stable `code` lets callers/tests branch without parsing `message`.
 *   - `cause` may carry a low-level Node error whose `.code` (e.g. `ECONNRESET`,
 *     `ETIMEDOUT`) is a non-sensitive syscall label — useful for diagnostics.
 *     The transport strips everything else off the underlying error first.
 *
 * These deliberately mirror the shape of the OAuth/refresh error classes in
 * `services/oauth/refreshAndRetry.ts` (stable name + typed discriminant) so the
 * execution engine can classify them the same way.
 */

export type MtlsErrorCode =
  | "invalid_url"
  | "certificate_parse_failed"
  | "private_key_parse_failed"
  | "key_certificate_mismatch"
  | "certificate_expired"
  | "certificate_not_yet_valid"
  | "connection_failed"
  | "tls_handshake_failed"
  | "timeout"
  | "response_too_large";

/** Base class for every mTLS transport failure. Message is always redacted. */
export class MtlsError extends Error {
  readonly code: MtlsErrorCode;
  /** Non-sensitive low-level cause code (e.g. `ECONNRESET`) when known. */
  readonly causeCode?: string;

  constructor(code: MtlsErrorCode, message: string, causeCode?: string) {
    super(message);
    this.name = "MtlsError";
    this.code = code;
    if (causeCode !== undefined) this.causeCode = causeCode;
  }
}

/**
 * Raised when the supplied certificate/key material is malformed or the private
 * key does not pair with the certificate. Distinct subclass so connect-time
 * credential validation (Slice B/C) can map it to a specific "your certificate
 * is invalid" message WITHOUT ever echoing the material.
 */
export class MtlsCertificateError extends MtlsError {
  constructor(code: MtlsErrorCode, message: string) {
    super(code, message);
    this.name = "MtlsCertificateError";
  }
}

/** Certificate window checks — thrown by `assertCertificateCurrentlyValid`. */
export class CertificateExpiredError extends MtlsCertificateError {
  /** ISO-8601 `notAfter` — a date, not a secret. */
  readonly notAfter: string;
  constructor(notAfter: string) {
    super("certificate_expired", "The client certificate has expired.");
    this.name = "CertificateExpiredError";
    this.notAfter = notAfter;
  }
}

export class CertificateNotYetValidError extends MtlsCertificateError {
  /** ISO-8601 `notBefore` — a date, not a secret. */
  readonly notBefore: string;
  constructor(notBefore: string) {
    super(
      "certificate_not_yet_valid",
      "The client certificate is not valid yet (notBefore is in the future).",
    );
    this.name = "CertificateNotYetValidError";
    this.notBefore = notBefore;
  }
}

/**
 * Convert an unknown thrown value into a non-sensitive cause code, if it looks
 * like a Node system error. Returns undefined otherwise. NEVER returns a message
 * (messages from TLS/socket errors can echo peer certificate details).
 */
export function extractCauseCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string" && /^[A-Z0-9_]{2,40}$/.test(c)) return c;
  }
  return undefined;
}
