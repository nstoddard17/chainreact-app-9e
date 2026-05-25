import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Dropbox webhook HMAC verification — Slice 3.DROPBOX-5.
 *
 * Per Dropbox's webhook docs
 * (https://www.dropbox.com/developers/reference/webhooks):
 *
 *   - Header: `X-Dropbox-Signature` — a bare lowercase-hex HMAC-SHA256
 *     digest (64 chars). No `sha256=` prefix, no timestamp, no replay
 *     window (Dropbox relies on HTTPS for transit integrity).
 *
 *   - Algorithm: HMAC-SHA256 over the **raw request body bytes** keyed
 *     with the Dropbox **app secret** (`DROPBOX_CLIENT_SECRET`). The
 *     receive route MUST capture the raw body BEFORE any JSON parse —
 *     re-serializing alters whitespace and breaks the digest.
 *
 *   - Compare: constant-time via `crypto.timingSafeEqual`. The
 *     length-mismatch guard MUST run BEFORE `timingSafeEqual` — the latter
 *     throws on different-length buffers.
 *
 * Closes the DROPBOX-1 audit gap: V1 NEVER verified `X-Dropbox-Signature`
 * (its generic verifier had no Dropbox arm; dev mode accepted unsigned).
 *
 * Returns a typed result discriminating
 * `missing_secret` / `missing_header` / `malformed` / `mismatch` so the
 * receive route maps distinct failures to distinct status codes:
 *   - `missing_secret` → route 503 (server misconfig — fail closed).
 *   - everything else → route 401.
 *
 * Mirrors `_shared/monday/webhooks/signature.ts` (raw body in, header in,
 * secret in, typed result out). Dropbox differs from Monday only in the
 * env var that supplies the key (the app secret, not a dedicated signing
 * secret).
 */

export type DropboxSignatureFailReason =
  | "missing_secret"
  | "missing_header"
  | "malformed"
  | "mismatch";

export type VerifyDropboxSignatureResult =
  | { valid: true }
  | { valid: false; reason: DropboxSignatureFailReason };

const SHA256_DIGEST_LENGTH = 32;

/**
 * Verify a Dropbox webhook signature.
 *
 * @param rawBody Exact bytes Dropbox signed — capture BEFORE any JSON parse.
 * @param signatureHeader The `X-Dropbox-Signature` header value, or `null`.
 * @param secret The `DROPBOX_CLIENT_SECRET` env value. Empty / missing
 *   returns `missing_secret` — the route maps this to 503 to fail-closed.
 */
export function verifyDropboxSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): VerifyDropboxSignatureResult {
  if (!secret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_header" };

  // Dropbox sends a bare lowercase-hex digest (64 chars).
  if (signatureHeader.length !== SHA256_DIGEST_LENGTH * 2) {
    return { valid: false, reason: "malformed" };
  }
  if (!/^[0-9a-f]+$/.test(signatureHeader)) {
    return { valid: false, reason: "malformed" };
  }

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(signatureHeader, "hex");
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
