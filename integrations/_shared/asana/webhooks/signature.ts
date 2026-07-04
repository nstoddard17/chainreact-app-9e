import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Asana webhook HMAC verification — Slice 5.ASANA-1.
 *
 * Per https://developers.asana.com/docs/webhooks-guide:
 *
 *   - Header: `X-Hook-Signature` — lowercase-hex HMAC-SHA256 digest
 *     (64 chars) over the RAW request body bytes.
 *   - Key: the webhook's OWN `X-Hook-Secret`, delivered exactly once via
 *     the creation handshake and persisted (encrypted) on the trigger row
 *     — Asana secrets are PER WEBHOOK, unlike Monday's app-level
 *     MONDAY_SIGNING_SECRET. There is no missing-env failure mode here;
 *     a row without a stored secret is handled upstream in receive.ts.
 *   - Compare: constant-time via `crypto.timingSafeEqual`, with the
 *     length-mismatch guard BEFORE the call (it throws on different-length
 *     buffers).
 *
 * Mirrors `_shared/monday/webhooks/signature.ts` (raw body in, header in,
 * secret in, typed result out).
 */

export type AsanaSignatureFailReason =
  | "missing_secret"
  | "missing_header"
  | "malformed"
  | "mismatch";

export type VerifyAsanaSignatureResult =
  | { valid: true }
  | { valid: false; reason: AsanaSignatureFailReason };

const SHA256_DIGEST_LENGTH = 32;

/**
 * Verify an Asana webhook delivery signature.
 *
 * @param rawBody Exact bytes Asana signed — capture BEFORE any JSON parse.
 * @param signatureHeader The `X-Hook-Signature` header value, or `null`.
 * @param secret The webhook's decrypted X-Hook-Secret from the trigger row.
 */
export function verifyAsanaSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): VerifyAsanaSignatureResult {
  if (!secret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_header" };

  const providedHex = signatureHeader.trim().toLowerCase();
  if (providedHex.length !== SHA256_DIGEST_LENGTH * 2) {
    return { valid: false, reason: "malformed" };
  }
  if (!/^[0-9a-f]+$/.test(providedHex)) {
    return { valid: false, reason: "malformed" };
  }

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();

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
