import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Calendly webhook HMAC verification — Slice 5.CALENDLY-1.
 *
 * Per the official webhook-signatures doc (Stripe-style scheme; format
 * cross-verified against production integrations — see
 * docs/providers/calendly/research.md "Webhook signature verification"):
 *
 *   - Header: `Calendly-Webhook-Signature` with the comma-separated form
 *     `t=<unix-seconds>,v1=<hex-signature>`.
 *   - `v1` = HEX-encoded HMAC-SHA256 digest (hex, NOT base64 — contrast
 *     Typeform) over the concatenation `<t>.<raw request body>` (the
 *     timestamp value, a literal dot, the exact raw bytes).
 *   - Key: the subscription's OWN `signing_key` — V2 mints it at
 *     activation and sends it in the POST /webhook_subscriptions body,
 *     persisted encrypted on the trigger row. Per-subscription secrets,
 *     so verification happens AFTER row resolution and there is no
 *     missing-env failure mode.
 *   - Compare: constant-time via `crypto.timingSafeEqual`, with the
 *     length-mismatch guard BEFORE the call (it throws on
 *     different-length buffers).
 *
 * Replay tolerance — deliberately GENEROUS (24h + 5min skew): Calendly
 * retries failed deliveries with exponential backoff for up to 24 hours,
 * and whether retries are RE-SIGNED with a fresh timestamp is
 * unverified (research.md). A tight window could 401 legitimate retries
 * until Calendly disables the subscription. The `webhook_event_dedup`
 * store is the effective replay guard (exactly as for Asana/Typeform,
 * whose signatures carry no timestamp at all); the tolerance here only
 * bounds ancient replays. Revisit after Phase 13 observes real retry
 * behavior.
 *
 * Mirrors `_shared/typeform/webhooks/signature.ts` (raw body in, header
 * in, secret in, typed result out) with the timestamped hex wire format
 * swapped in.
 */

export type CalendlySignatureFailReason =
  | "missing_secret"
  | "missing_header"
  | "malformed"
  | "stale_timestamp"
  | "mismatch";

export type VerifyCalendlySignatureResult =
  | { valid: true }
  | { valid: false; reason: CalendlySignatureFailReason };

const SHA256_HEX_LENGTH = 64;

/** 24h retry horizon + 5 minutes of clock skew, in seconds. */
export const CALENDLY_REPLAY_TOLERANCE_SECONDS = 24 * 60 * 60 + 5 * 60;

/** Parse `t=…,v1=…` into its parts (order-insensitive, extras ignored). */
function parseSignatureHeader(header: string): {
  timestamp: string | null;
  signature: string | null;
} {
  let timestamp: string | null = null;
  let signature: string | null = null;
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1") signature = value;
  }
  return { timestamp, signature };
}

/**
 * Verify a Calendly webhook delivery signature.
 *
 * @param rawBody Exact bytes Calendly signed — capture BEFORE any JSON parse.
 * @param signatureHeader The `Calendly-Webhook-Signature` header value, or `null`.
 * @param secret The subscription's decrypted signing key from the trigger row.
 * @param nowEpochSeconds Injectable clock for tests; defaults to Date.now().
 */
export function verifyCalendlySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowEpochSeconds: number = Math.floor(Date.now() / 1000),
): VerifyCalendlySignatureResult {
  if (!secret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_header" };

  const { timestamp, signature } = parseSignatureHeader(signatureHeader);
  if (!timestamp || !signature) {
    return { valid: false, reason: "malformed" };
  }

  const timestampNum = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampNum) || String(timestampNum) !== timestamp) {
    return { valid: false, reason: "malformed" };
  }

  // Hex-decode defensively: reject inputs that don't round-trip to a
  // 32-byte SHA-256 digest (Buffer.from(…, "hex") silently truncates at
  // the first invalid pair).
  if (
    signature.length !== SHA256_HEX_LENGTH ||
    !/^[0-9a-fA-F]+$/.test(signature)
  ) {
    return { valid: false, reason: "malformed" };
  }
  const provided = Buffer.from(signature, "hex");

  // Signed string: `<t>.<raw body>` — verify BEFORE the freshness check
  // so a forged header can never learn which timestamps we'd accept.
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`, "utf8")
    .update(rawBody, "utf8")
    .digest();

  if (!timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "mismatch" };
  }

  if (Math.abs(nowEpochSeconds - timestampNum) > CALENDLY_REPLAY_TOLERANCE_SECONDS) {
    return { valid: false, reason: "stale_timestamp" };
  }

  return { valid: true };
}
