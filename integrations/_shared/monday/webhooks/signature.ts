import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Monday webhook HMAC verification — Slice 3.MONDAY-7.
 *
 * Per V1's `app/api/webhooks/monday/route.ts` + Monday's webhook docs
 * (https://developer.monday.com/apps/docs/webhooks):
 *
 *   - Header: `x-monday-signature` — a bare lowercase-hex HMAC-SHA256
 *     digest (64 chars). **No `sha256=` prefix, no timestamp, no replay
 *     window** — Monday relies on HTTPS for transit integrity. (V1
 *     compared the header verbatim against `hmac.digest('hex')`.)
 *
 *   - Algorithm: HMAC-SHA256 over the **raw request body bytes** keyed
 *     with **`MONDAY_SIGNING_SECRET`**. The receive route MUST capture
 *     the raw body BEFORE any JSON parse — re-serializing alters
 *     whitespace and breaks the digest.
 *
 *   - Compare: constant-time via `crypto.timingSafeEqual`. The
 *     length-mismatch guard MUST run BEFORE `timingSafeEqual` — the
 *     latter throws on different-length buffers.
 *
 * Returns a typed result discriminating
 * `missing_secret` / `missing_header` / `malformed` / `mismatch` so the
 * receive route maps distinct failures to distinct status codes:
 *   - `missing_secret` → route 503 (server misconfig — fail closed per
 *     the MONDAY-7 plan; V1 silently SKIPPED verification when the
 *     secret was unset).
 *   - everything else → route 401.
 *
 * Mirrors `_shared/github/webhooks/signature.ts` (raw body in, header
 * in, secret in, typed result out). Monday differs from GitHub only in
 * the header carrying a BARE hex digest (no `sha256=` prefix).
 */

export type MondaySignatureFailReason =
  | "missing_secret"
  | "missing_header"
  | "malformed"
  | "mismatch";

export type VerifyMondaySignatureResult =
  | { valid: true }
  | { valid: false; reason: MondaySignatureFailReason };

const SHA256_DIGEST_LENGTH = 32;

/**
 * Verify a Monday webhook signature.
 *
 * @param rawBody Exact bytes Monday signed — capture BEFORE any JSON parse.
 * @param signatureHeader The `x-monday-signature` header value, or `null`.
 * @param secret The `MONDAY_SIGNING_SECRET` env value. Empty / missing
 *   returns `missing_secret` — the route maps this to 503 to fail-closed.
 */
export function verifyMondaySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): VerifyMondaySignatureResult {
  if (!secret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_header" };

  // Monday sends a bare lowercase-hex digest. Tolerate a `sha256=`
  // prefix defensively (some Monday app configs prepend it), then
  // enforce 64 lowercase-hex chars.
  const providedHex = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

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
