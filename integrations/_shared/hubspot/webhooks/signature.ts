import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HubSpot V3 webhook signature verification — Slice 13 Commit 5.
 *
 * Per HubSpot's webhook validation docs
 * (https://developers.hubspot.com/docs/api/webhooks/validating-requests):
 *
 *   - Header: `X-HubSpot-Signature-V3: <base64>` — a base64-encoded
 *     HMAC-SHA256 digest computed over the canonical request string.
 *   - Header: `X-HubSpot-Request-Timestamp: <unix-millis>` — the unix
 *     epoch millisecond timestamp HubSpot signed the request at.
 *
 *   - Canonical request string (concatenated with NO separators):
 *
 *       ${requestMethod}${requestUri}${rawBody}${requestTimestamp}
 *
 *     where `requestUri` is the FULL request URI as HubSpot saw it
 *     (scheme + host + path + query). HubSpot signs with whatever
 *     target URL is configured in the developer-portal app settings,
 *     so callers MUST pass that exact URL — receive routes derive it
 *     from the Request `Host` header / explicit env override, NOT from
 *     `request.url` (which Next.js may rewrite to an internal host).
 *
 *   - Algorithm: HMAC-SHA256 keyed with `HUBSPOT_CLIENT_SECRET` (the
 *     single global app secret; HubSpot uses the same secret for every
 *     install of the app — distinct from Stripe's per-endpoint
 *     `whsec_xxx` model). Receive route MUST capture the raw body
 *     BEFORE any JSON parsing — re-serializing would alter whitespace
 *     and break the digest.
 *
 *   - Replay protection: HubSpot's docs require receivers to reject
 *     requests whose timestamp is older than 5 minutes (300_000 ms).
 *     V2 mirrors the doc'd default; the test surface accepts an
 *     injected `nowMs` for deterministic tests. Requests too far in
 *     the future are also rejected (defense-in-depth against malicious
 *     clock-skew payloads).
 *
 *   - Compare: constant-time via `crypto.timingSafeEqual`. The
 *     length-mismatch guard MUST run BEFORE `timingSafeEqual` — that
 *     primitive throws on length mismatch, which would leak the wrong
 *     failure mode (looks like a server error) to callers.
 *
 * Returns a typed result discriminating "valid" / "missing_header" /
 * "missing_timestamp" / "malformed_timestamp" / "expired" / "malformed"
 * / "mismatch" so the receive route can map distinct failures to the
 * same 401 with diagnostic logs.
 *
 * Mirrors `_shared/stripe/webhooks/signature.ts` shape (raw body in,
 * header in, secret in, typed result out) — the cross-provider
 * contract stays consistent. HubSpot's variant is more elaborate:
 * canonical string includes method + URI, and the timestamp lives in
 * a SEPARATE header (Stripe embeds `t=` inside `Stripe-Signature`).
 *
 * **V1 has zero signature verification** — V2 closes a real security
 * gap during the port. V1's
 * [`app/api/webhooks/hubspot/route.ts:62`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/hubspot/route.ts#L62)
 * calls `req.json()` immediately without ever reading either the
 * signature or timestamp headers.
 */

export type HubSpotSignatureFailReason =
  | "missing_header"
  | "missing_timestamp"
  | "malformed_timestamp"
  | "expired"
  | "malformed"
  | "mismatch";

export type VerifyHubSpotSignatureResult =
  | { valid: true }
  | { valid: false; reason: HubSpotSignatureFailReason };

/**
 * Default replay tolerance — 5 minutes / 300_000 ms. Matches HubSpot's
 * doc'd recommendation. Rejecting outside this window guards against
 * replay attacks (re-submitting an old signed request to a public
 * endpoint).
 */
export const HUBSPOT_SIGNATURE_DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

export interface VerifyHubSpotSignatureInput {
  /**
   * The HTTP method HubSpot signed against. Always `"POST"` for the
   * webhook receive route — but exposed as an input so the canonical
   * string builder stays general-purpose (future preflight/handshake
   * methods can reuse this verifier).
   */
  method: string;
  /**
   * The FULL request URI as HubSpot saw it (scheme + host + path +
   * query). Callers MUST construct this from the configured target
   * URL — not `request.url` directly, since Next.js may rewrite the
   * host. Trailing slash semantics matter: HubSpot signs the exact
   * configured URL.
   */
  requestUri: string;
  /**
   * Exact bytes HubSpot signed — receive route MUST capture this
   * BEFORE any JSON parsing.
   */
  rawBody: string;
  /**
   * The `X-HubSpot-Signature-V3` header value, or `null` when absent.
   * Returns `{ valid: false, reason: "missing_header" }` on null /
   * empty.
   */
  signatureHeader: string | null;
  /**
   * The `X-HubSpot-Request-Timestamp` header value, or `null` when
   * absent. Returns `{ valid: false, reason: "missing_timestamp" }`
   * on null / empty. Non-numeric → `"malformed_timestamp"`.
   */
  timestampHeader: string | null;
  /**
   * `HUBSPOT_CLIENT_SECRET` env value. Empty string returns
   * `{ valid: false, reason: "mismatch" }` — cleaner than throwing
   * because misconfigured deployments shouldn't silently accept
   * unsigned webhooks (callers should fail at env-read time, but
   * this verifier is the second-line defense).
   */
  secret: string;
  /**
   * Replay tolerance in milliseconds; default 300_000 (5 min).
   */
  toleranceMs?: number;
  /**
   * Inject a fake `now` (epoch millis) for deterministic tests;
   * defaults to `Date.now()`.
   */
  nowMs?: number;
}

/**
 * Verify a HubSpot V3 webhook signature.
 */
export function verifyHubSpotSignature(
  input: VerifyHubSpotSignatureInput,
): VerifyHubSpotSignatureResult {
  const {
    method,
    requestUri,
    rawBody,
    signatureHeader,
    timestampHeader,
    secret,
    toleranceMs = HUBSPOT_SIGNATURE_DEFAULT_TOLERANCE_MS,
    nowMs = Date.now(),
  } = input;

  if (!signatureHeader) return { valid: false, reason: "missing_header" };
  if (!secret) return { valid: false, reason: "mismatch" };
  if (!timestampHeader) return { valid: false, reason: "missing_timestamp" };

  // Timestamp must be an integer-string in unix-millis. HubSpot sends
  // a base-10 integer; reject anything that doesn't round-trip exactly
  // (catches floating-point representations / whitespace padding /
  // hex prefixes — strict equality, NOT trimmed, because well-formed
  // HTTP headers don't carry interior whitespace).
  const timestampMs = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestampMs) || String(timestampMs) !== timestampHeader) {
    return { valid: false, reason: "malformed_timestamp" };
  }

  if (Math.abs(nowMs - timestampMs) > toleranceMs) {
    return { valid: false, reason: "expired" };
  }

  // Canonical request string: ${method}${uri}${body}${timestamp}
  // concatenated with NO separators. The timestamp goes in as the
  // ORIGINAL header string (not the parsed int) — round-tripping
  // through Number.parseInt would strip e.g. leading whitespace, but
  // we already rejected that above via the strict equality check.
  const canonical = `${method}${requestUri}${rawBody}${timestampHeader}`;

  const expected = createHmac("sha256", secret)
    .update(canonical, "utf8")
    .digest();

  // Decode the header from base64 to raw bytes for constant-time compare.
  // `Buffer.from("x", "base64")` silently produces a partial buffer for
  // bad base64 inputs rather than throwing — we catch this with the
  // length-mismatch check below. Anything that isn't a 32-byte SHA-256
  // digest (which encodes to 44 base64 chars) is rejected as malformed.
  let provided: Buffer;
  try {
    provided = Buffer.from(signatureHeader, "base64");
  } catch {
    return { valid: false, reason: "malformed" };
  }

  // Length-mismatch guard MUST run BEFORE timingSafeEqual — the latter
  // throws on different-length buffers.
  if (provided.length !== expected.length) {
    return { valid: false, reason: "malformed" };
  }

  if (!timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "mismatch" };
  }

  return { valid: true };
}
