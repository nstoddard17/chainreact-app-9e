import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe webhook HMAC verification — Slice 11 Commit 4.
 *
 * Per Stripe's webhook docs (https://docs.stripe.com/webhooks/signatures):
 *
 *   - Header: `Stripe-Signature: t=<unix-seconds>,v1=<hex>,v1=<hex>`
 *     where `t=` is the unix timestamp the request was signed at and
 *     each `v1=` is HMAC-SHA256(`${t}.${rawBody}`, secret).hex.
 *     Multiple `v1=` candidates appear during secret rotation — Stripe
 *     signs new requests with both the old and new secrets so receivers
 *     have a window to swap. ANY match accepts.
 *
 *   - Algorithm: HMAC-SHA256 over `${timestamp}.${rawBody}`. Both halves
 *     joined by a literal period, no whitespace. The receive route MUST
 *     capture the raw body BEFORE any JSON parsing — re-serializing
 *     would alter whitespace and break the digest.
 *
 *   - Replay protection: receivers reject when |now - t| exceeds a
 *     configurable tolerance window. Stripe's SDK defaults to 300s.
 *     V2 mirrors that default; the test surface accepts an injected
 *     `nowSeconds` for deterministic timestamp tests.
 *
 *   - Compare: constant-time via `crypto.timingSafeEqual`. Length-mismatch
 *     check happens BEFORE timingSafeEqual (which throws on length
 *     mismatch — caused a real production bug in another codebase).
 *
 * Returns a typed result discriminating "valid" / "expired" / generic
 * "invalid" so the receive route can map to the right error class
 * (`SignatureExpiredError` is a subclass of `InvalidSignatureError`,
 * both surfacing as 401 but tagged distinctly for diagnostic logs).
 *
 * Mirrors `_shared/airtable/webhooks/signature.ts` shape (returns a
 * boolean / typed result, takes raw body + header + secret) so the
 * cross-provider contract stays consistent.
 */

export type StripeSignatureFailReason =
  | "missing_header"
  | "malformed_header"
  | "malformed_timestamp"
  | "no_v1_signatures"
  | "expired"
  | "mismatch";

export type VerifyStripeSignatureResult =
  | { valid: true }
  | { valid: false; reason: StripeSignatureFailReason };

/**
 * Default tolerance window — 300 seconds, matches Stripe SDK default.
 * Rejecting outside this window guards against replay attacks
 * (re-submitting an old signed request).
 */
export const STRIPE_SIGNATURE_DEFAULT_TOLERANCE_SECONDS = 300;

interface ParsedHeader {
  timestamp: number;
  v1Candidates: string[];
}

/**
 * Parse a `Stripe-Signature` header value into its `t=` timestamp and
 * `v1=<hex>` candidates. Returns `null` on shapes Stripe never sends
 * (no `t=`, no `v1=`, non-numeric timestamp).
 *
 * Parsing tolerates extra fields (Stripe may add new signature schemes
 * like `v2=` in the future — V2 ignores those for forward
 * compatibility). Whitespace around `,` is tolerated.
 */
function parseHeader(value: string): ParsedHeader | null {
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  let timestamp: number | null = null;
  const v1Candidates: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!v) continue;
    if (key === "t") {
      const parsed = Number.parseInt(v, 10);
      if (Number.isFinite(parsed) && String(parsed) === v) {
        timestamp = parsed;
      }
    } else if (key === "v1") {
      v1Candidates.push(v);
    }
  }
  if (timestamp === null) return null;
  return { timestamp, v1Candidates };
}

/**
 * Verify a Stripe webhook signature.
 *
 * @param rawBody The exact bytes Stripe signed — receive route MUST
 *   capture this BEFORE any JSON parsing.
 * @param signatureHeader The `Stripe-Signature` header value, or
 *   `null` when absent. Returns `{ valid: false, reason: "missing_header" }`
 *   on null.
 * @param secret The endpoint signing secret (`whsec_xxx`) returned by
 *   `POST /v1/webhook_endpoints` at activation time. Persisted in
 *   `trigger_resources.config.endpointSecret`.
 * @param options.toleranceSeconds Replay tolerance; default 300s.
 * @param options.nowSeconds Inject a fake `now` for deterministic tests;
 *   defaults to `Math.floor(Date.now() / 1000)`.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  options: {
    toleranceSeconds?: number;
    nowSeconds?: number;
  } = {},
): VerifyStripeSignatureResult {
  if (!signatureHeader) return { valid: false, reason: "missing_header" };
  if (!secret) return { valid: false, reason: "mismatch" };

  const parsed = parseHeader(signatureHeader);
  if (!parsed) {
    // Header doesn't have a parseable `t=` — could be empty,
    // entirely malformed, or only carry non-canonical fields.
    if (!signatureHeader.includes("t=")) {
      return { valid: false, reason: "malformed_header" };
    }
    return { valid: false, reason: "malformed_timestamp" };
  }
  if (parsed.v1Candidates.length === 0) {
    return { valid: false, reason: "no_v1_signatures" };
  }

  const tolerance =
    options.toleranceSeconds ?? STRIPE_SIGNATURE_DEFAULT_TOLERANCE_SECONDS;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > tolerance) {
    return { valid: false, reason: "expired" };
  }

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest();

  for (const candidate of parsed.v1Candidates) {
    let provided: Buffer;
    try {
      provided = Buffer.from(candidate, "hex");
    } catch {
      continue;
    }
    // Stripe's v1 is hex of a 32-byte SHA-256 digest = 64 hex chars.
    // `Buffer.from(invalid-hex, "hex")` silently produces a partial
    // buffer rather than throwing — the length check is the
    // unambiguous "not this candidate" signal.
    if (provided.length !== expected.length) continue;
    if (timingSafeEqual(provided, expected)) {
      return { valid: true };
    }
  }

  return { valid: false, reason: "mismatch" };
}
