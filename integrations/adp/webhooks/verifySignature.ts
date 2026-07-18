import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ADP event-notification (webhook) signature verification.
 *
 * Confirmed against ADP's Event Notification docs (docs/providers/adp/research.md):
 * each pushed event carries an `adpx-messageauthentication` header whose value is
 * an HMAC-SHA256 hash computed with the data-connector **client secret** as the
 * key and the data-connector **client id** as the message. Recompute it from the
 * account's stored ADP credential and compare in constant time to authenticate
 * that the delivery originated from ADP.
 *
 * NOTE (quirk to confirm at live-cert): as documented, the signature is a
 * function of (clientId, clientSecret) ONLY — not the event body — so it is
 * constant per connector. That means it proves connector identity, not per-message
 * integrity; body-tamper detection would additionally require TLS + trusting ADP's
 * delivery. We implement exactly what ADP documents and record this in research.md
 * for the live-certification review.
 *
 * NO-LEAK: never logs the header, secret, or computed hash.
 */

export const ADP_MESSAGE_AUTH_HEADER = "adpx-messageauthentication";

/** Compute the expected `adpx-messageauthentication` value (hex). */
export function computeAdpMessageAuth(clientId: string, clientSecret: string): string {
  return createHmac("sha256", clientSecret).update(clientId).digest("hex");
}

/**
 * Constant-time verification of a received `adpx-messageauthentication` header
 * against the account's stored ADP client id + secret. Returns false on any
 * mismatch, missing header, or length difference (never throws).
 */
export function verifyAdpWebhookSignature(input: {
  headerValue: string | null | undefined;
  clientId: string;
  clientSecret: string;
}): boolean {
  if (!input.headerValue) return false;
  const expected = computeAdpMessageAuth(input.clientId, input.clientSecret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(input.headerValue, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
