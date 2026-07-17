import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Motive webhook HMAC verification — MOTIVE-1.
 *
 * Per developer-docs.gomotive.com/reference/overview-company-webhooks:
 *   - Header: `X-KT-Webhook-Signature` (legacy KeepTruckin `KT` prefix — kept
 *     verbatim; do not "modernize").
 *   - Algorithm: **HMAC-SHA1**, lowercase-hex (40 chars), over the RAW request
 *     body bytes. SHA1 is dated but provider-mandated.
 *   - Key: the webhook's 20-char `secret`. V2 GENERATES this secret at
 *     `POST /v1/company_webhooks` time (crypto.randomBytes) and stores it
 *     encrypted on the trigger row — so verification happens AFTER row
 *     resolution and there is no app-level env-secret failure mode.
 *   - Compare: constant-time via `crypto.timingSafeEqual`, with a length guard
 *     BEFORE the call (it throws on different-length buffers).
 *
 * Mirrors `_shared/asana/webhooks/signature.ts` (raw body in, header in, secret
 * in, typed result out) — differing only in the SHA1 digest + hex length.
 */

export type MotiveSignatureFailReason =
  | "missing_secret"
  | "missing_header"
  | "malformed"
  | "mismatch";

export type VerifyMotiveSignatureResult =
  | { valid: true }
  | { valid: false; reason: MotiveSignatureFailReason };

const SHA1_DIGEST_LENGTH = 20; // bytes → 40 hex chars

/**
 * Verify a Motive webhook delivery signature.
 *
 * @param rawBody Exact bytes Motive signed — capture BEFORE any JSON parse.
 * @param signatureHeader The `X-KT-Webhook-Signature` header value, or `null`.
 * @param secret The webhook's decrypted 20-char secret from the trigger row.
 */
export function verifyMotiveSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): VerifyMotiveSignatureResult {
  if (!secret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_header" };

  const providedHex = signatureHeader.trim().toLowerCase();
  if (providedHex.length !== SHA1_DIGEST_LENGTH * 2) {
    return { valid: false, reason: "malformed" };
  }
  if (!/^[0-9a-f]+$/.test(providedHex)) {
    return { valid: false, reason: "malformed" };
  }

  const expected = createHmac("sha1", secret).update(rawBody, "utf8").digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(providedHex, "hex");
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (provided.length !== expected.length) {
    return { valid: false, reason: "malformed" };
  }
  if (!timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "mismatch" };
  }
  return { valid: true };
}

/**
 * Generate a Motive webhook shared secret. Motive requires the secret to be
 * EXACTLY 20 characters — `randomBytes(10).toString("hex")` is 20 hex chars.
 * Callers pass this to `POST /v1/company_webhooks` and store it encrypted.
 */
export function generateMotiveWebhookSecret(): string {
  return randomBytes(10).toString("hex");
}
