import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Typeform webhook HMAC verification — Slice 5.TYPEFORM-1.
 *
 * Per https://www.typeform.com/developers/webhooks/secure-your-webhooks/:
 *
 *   - Header: `Typeform-Signature` — the literal prefix `sha256=`
 *     followed by the BASE64-encoded HMAC-SHA256 digest over the RAW
 *     request body bytes (base64, NOT hex — a documented common
 *     implementation mistake; contrast Asana's bare-hex header).
 *   - Key: the webhook's OWN secret — V2 mints it at activation and
 *     sends it in the PUT body, persisted encrypted on the trigger row.
 *     Per-webhook secrets, so verification happens AFTER row resolution
 *     and there is no missing-env failure mode.
 *   - Compare: constant-time via `crypto.timingSafeEqual`, with the
 *     length-mismatch guard BEFORE the call (it throws on
 *     different-length buffers).
 *
 * Mirrors `_shared/asana/webhooks/signature.ts` (raw body in, header in,
 * secret in, typed result out) with the base64 wire format swapped in.
 */

export type TypeformSignatureFailReason =
  | "missing_secret"
  | "missing_header"
  | "malformed"
  | "mismatch";

export type VerifyTypeformSignatureResult =
  | { valid: true }
  | { valid: false; reason: TypeformSignatureFailReason };

const SIGNATURE_PREFIX = "sha256=";
const SHA256_DIGEST_LENGTH = 32;

/**
 * Verify a Typeform webhook delivery signature.
 *
 * @param rawBody Exact bytes Typeform signed — capture BEFORE any JSON parse.
 * @param signatureHeader The `Typeform-Signature` header value, or `null`.
 * @param secret The webhook's decrypted secret from the trigger row.
 */
export function verifyTypeformSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): VerifyTypeformSignatureResult {
  if (!secret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_header" };

  const trimmed = signatureHeader.trim();
  if (!trimmed.startsWith(SIGNATURE_PREFIX)) {
    return { valid: false, reason: "malformed" };
  }
  const providedBase64 = trimmed.slice(SIGNATURE_PREFIX.length);
  if (providedBase64.length === 0) {
    return { valid: false, reason: "malformed" };
  }

  let provided: Buffer;
  try {
    provided = Buffer.from(providedBase64, "base64");
  } catch {
    return { valid: false, reason: "malformed" };
  }
  // Buffer.from(…, "base64") silently drops invalid chars — reject inputs
  // that don't round-trip to a 32-byte SHA-256 digest.
  if (provided.length !== SHA256_DIGEST_LENGTH) {
    return { valid: false, reason: "malformed" };
  }

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();

  if (!timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "mismatch" };
  }
  return { valid: true };
}
