import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * GitHub webhook HMAC verification — Slice 14b Commit 4.
 *
 * Per GitHub webhook docs (https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries):
 *
 *   - Header: `X-Hub-Signature-256: sha256=<hex>` — `sha256=` prefix
 *     followed by a 64-character lowercase-hex digest. **No timestamp,
 *     no replay tolerance** — GitHub relies on HTTPS for transit
 *     integrity and on `X-GitHub-Delivery` (per-delivery unique id) for
 *     dedup.
 *
 *   - Algorithm: HMAC-SHA256 over the **raw request body bytes** keyed
 *     with **`GITHUB_WEBHOOK_SECRET`**. Slice 14b plan §"Signature
 *     verification model" closes V1's gap of falling back to
 *     `GITHUB_CLIENT_SECRET` — the webhook secret is its own env var
 *     and there is NO fallback.
 *     Receive route MUST capture the raw body BEFORE any JSON parsing
 *     — re-serializing alters whitespace and breaks the digest.
 *
 *   - Compare: constant-time via `crypto.timingSafeEqual`. The
 *     length-mismatch guard MUST run BEFORE `timingSafeEqual` —
 *     `timingSafeEqual` throws on length mismatch, which would leak
 *     the wrong failure mode to callers.
 *
 *   - GitHub also sends `X-Hub-Signature` (HMAC-SHA1 — legacy/deprecated).
 *     V2 ONLY verifies the SHA-256 variant. Anti-parity with V1's
 *     receive route which also only checked SHA-256.
 *
 * Returns a typed result discriminating "valid" / "missing_secret" /
 * "missing_header" / "malformed" / "mismatch" so the receive route can
 * map distinct failures to distinct status codes:
 *   - `missing_secret` → route 503 (server misconfig — closes V1 gap
 *     where the route silently accepted unsigned events when the
 *     secret env var was missing).
 *   - everything else → route 401.
 *
 * Mirrors `_shared/shopify/webhooks/signature.ts` shape (raw body in,
 * header in, secret in, typed result out) — the cross-provider
 * contract stays consistent. The GitHub variant differs from Shopify
 * in three ways:
 *   1. Header value carries a `sha256=` prefix (Shopify's is bare
 *      base64).
 *   2. Encoding is hex (Shopify's is base64).
 *   3. Empty/missing secret returns a distinct `missing_secret` reason
 *      so the route can fail-closed at 503 (Shopify rolls missing
 *      secret into `mismatch` and 401-rejects).
 */

export type GitHubSignatureFailReason =
  | "missing_secret"
  | "missing_header"
  | "malformed"
  | "mismatch";

export type VerifyGitHubSignatureResult =
  | { valid: true }
  | { valid: false; reason: GitHubSignatureFailReason };

const SHA256_DIGEST_LENGTH = 32;
const PREFIX = "sha256=";

/**
 * Verify a GitHub webhook signature.
 *
 * @param rawBody Exact bytes GitHub signed — receive route MUST capture
 *   this BEFORE any JSON parsing.
 * @param signatureHeader The `X-Hub-Signature-256` header value, or
 *   `null` when absent. Returns `missing_header` on null / empty.
 * @param secret The GitHub webhook shared secret
 *   (`GITHUB_WEBHOOK_SECRET` env). Empty / missing returns
 *   `missing_secret` — the route maps this to 503 to fail-closed.
 *   This is the load-bearing V1-bug-fix: V1's receive route returned
 *   `true` (allowed) when the secret was missing.
 */
export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): VerifyGitHubSignatureResult {
  if (!secret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_header" };

  // Header MUST start with `sha256=` — anything else is malformed.
  if (!signatureHeader.startsWith(PREFIX)) {
    return { valid: false, reason: "malformed" };
  }
  const providedHex = signatureHeader.slice(PREFIX.length);

  // 32-byte SHA-256 digest = 64 hex chars exactly.
  if (providedHex.length !== SHA256_DIGEST_LENGTH * 2) {
    return { valid: false, reason: "malformed" };
  }
  // Reject anything that isn't lowercase hex. GitHub's docs specify
  // lowercase hex; accepting uppercase would diverge from the wire
  // contract.
  if (!/^[0-9a-f]+$/.test(providedHex)) {
    return { valid: false, reason: "malformed" };
  }

  // Compute expected digest.
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest();

  // Decode the provided hex into raw bytes for constant-time compare.
  let provided: Buffer;
  try {
    provided = Buffer.from(providedHex, "hex");
  } catch {
    return { valid: false, reason: "malformed" };
  }

  // Length-mismatch guard MUST run BEFORE timingSafeEqual — the latter
  // throws on different-length buffers. The earlier hex-length check
  // already enforces 64 chars / 32 bytes; this is defense-in-depth.
  if (provided.length !== expected.length) {
    return { valid: false, reason: "malformed" };
  }

  if (!timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "mismatch" };
  }
  return { valid: true };
}
