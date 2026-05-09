import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shopify webhook HMAC verification — Slice 12 Commit 4.
 *
 * Per Shopify's webhook docs (https://shopify.dev/docs/apps/build/webhooks/subscribe/get-started):
 *
 *   - Header: `X-Shopify-Hmac-SHA256: <base64>` — a single base64-encoded
 *     HMAC-SHA256 digest. **No timestamp**, **no replay tolerance** —
 *     Shopify's docs rely on the HTTPS transport for transit integrity
 *     and on `X-Shopify-Webhook-Id` (per-delivery unique id) for dedup.
 *
 *   - Algorithm: HMAC-SHA256 over the **raw request body bytes** keyed
 *     with the **single global app secret** (`SHOPIFY_CLIENT_SECRET`).
 *     Every webhook V2 creates against any merchant verifies against
 *     the same secret — distinct from Stripe's per-endpoint
 *     `whsec_xxx` model. Receive route MUST capture the raw body
 *     BEFORE any JSON parsing — re-serializing would alter whitespace
 *     and break the digest.
 *
 *   - Compare: constant-time via `crypto.timingSafeEqual`. The
 *     length-mismatch guard MUST run BEFORE `timingSafeEqual` —
 *     `timingSafeEqual` throws on length mismatch, which would leak
 *     the wrong failure mode to callers.
 *
 * Returns a typed result discriminating "valid" / "missing_header" /
 * "malformed" / "mismatch" so the receive route can map distinct
 * failures to the same 401 with diagnostic logs.
 *
 * Mirrors `_shared/stripe/webhooks/signature.ts` shape (raw body in,
 * header in, secret in, typed result out) — so the cross-provider
 * contract stays consistent. The Shopify variant is structurally
 * simpler because there's no timestamp / replay window.
 */

export type ShopifySignatureFailReason =
  | "missing_header"
  | "malformed"
  | "mismatch";

export type VerifyShopifySignatureResult =
  | { valid: true }
  | { valid: false; reason: ShopifySignatureFailReason };

/**
 * Verify a Shopify webhook signature.
 *
 * @param rawBody Exact bytes Shopify signed — receive route MUST capture
 *   this BEFORE any JSON parsing.
 * @param signatureHeader The `X-Shopify-Hmac-SHA256` header value, or
 *   `null` when absent. Returns `{ valid: false, reason: "missing_header" }`
 *   on null / empty.
 * @param secret The Shopify app secret (`SHOPIFY_CLIENT_SECRET` env).
 *   Empty string returns `{ valid: false, reason: "mismatch" }` —
 *   cleaner than throwing because mis-configured deployments shouldn't
 *   silently accept unsigned webhooks.
 */
export function verifyShopifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): VerifyShopifySignatureResult {
  if (!signatureHeader) return { valid: false, reason: "missing_header" };
  if (!secret) return { valid: false, reason: "mismatch" };

  // Compute expected base64 digest over the raw body bytes.
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
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
