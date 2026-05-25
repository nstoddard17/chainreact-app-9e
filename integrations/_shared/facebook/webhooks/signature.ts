import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Facebook webhook HMAC verification — Slice 3.FACEBOOK-5.
 *
 * Per Meta's webhook docs
 * (https://developers.facebook.com/docs/graph-api/webhooks/getting-started):
 *
 *   - Header: `X-Hub-Signature-256` — `sha256=` followed by a lowercase-hex
 *     HMAC-SHA256 digest (64 hex chars) of the RAW request body, keyed with
 *     the app secret (`FACEBOOK_CLIENT_SECRET`). The receive route MUST
 *     capture the raw body BEFORE any JSON parse — re-serializing alters
 *     whitespace and breaks the digest.
 *
 *   - Compare: constant-time via `crypto.timingSafeEqual`. The length-
 *     mismatch guard MUST run BEFORE `timingSafeEqual` (it throws on
 *     different-length buffers).
 *
 * Closes the FACEBOOK-1 audit gap: V1 NEVER verified `X-Hub-Signature-256`
 * (it processed POSTs unsigned). Mirrors `_shared/dropbox/webhooks/
 * signature.ts`; Facebook differs only in the `sha256=` header prefix.
 *
 * Returns a typed result discriminating
 * `missing_secret` / `missing_header` / `malformed` / `mismatch` so the
 * receive route maps distinct failures to distinct status codes:
 *   - `missing_secret` → route 503 (server misconfig — fail closed).
 *   - everything else → route 401.
 *
 * Security: never echoes the secret, the raw body, or the computed digest.
 */

export type FacebookSignatureFailReason =
  | "missing_secret"
  | "missing_header"
  | "malformed"
  | "mismatch";

export type VerifyFacebookSignatureResult =
  | { valid: true }
  | { valid: false; reason: FacebookSignatureFailReason };

const SHA256_DIGEST_LENGTH = 32;
const PREFIX = "sha256=";

/**
 * Verify a Facebook `X-Hub-Signature-256` webhook signature.
 *
 * @param rawBody Exact bytes Facebook signed — capture BEFORE any JSON parse.
 * @param signatureHeader The `X-Hub-Signature-256` header value, or `null`.
 * @param secret The `FACEBOOK_CLIENT_SECRET` env value. Empty / missing
 *   returns `missing_secret` — the route maps this to 503 to fail-closed.
 */
export function verifyFacebookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): VerifyFacebookSignatureResult {
  if (!secret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_header" };

  // Facebook sends `sha256=<64 lowercase hex chars>`.
  if (!signatureHeader.startsWith(PREFIX)) {
    return { valid: false, reason: "malformed" };
  }
  const hex = signatureHeader.slice(PREFIX.length);
  if (hex.length !== SHA256_DIGEST_LENGTH * 2 || !/^[0-9a-f]+$/.test(hex)) {
    return { valid: false, reason: "malformed" };
  }

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(hex, "hex");
  } catch {
    return { valid: false, reason: "malformed" };
  }

  // Length-mismatch guard MUST run BEFORE timingSafeEqual — it throws on
  // different-length buffers. The hex-length check above already enforces
  // 32 bytes; this is defense-in-depth.
  if (provided.length !== expected.length) {
    return { valid: false, reason: "malformed" };
  }

  if (!timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "mismatch" };
  }
  return { valid: true };
}
