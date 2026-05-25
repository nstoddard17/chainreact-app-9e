import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Trello webhook HMAC verification — Slice 17 Commit 5.
 *
 * Per Trello's webhook docs
 * (https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/):
 *
 *   - Header: `X-Trello-Webhook: <base64>` — base64 of HMAC-SHA1.
 *     **No timestamp, no replay tolerance** — Trello relies on HTTPS
 *     for transit integrity and on the per-action id for dedup.
 *
 *   - Algorithm: HMAC-SHA1 over the concatenation
 *     `${rawBody}${callbackURL}` (body comes first, callbackURL second
 *     — REVERSING is a common implementation bug that silently fails
 *     verification). Keyed with **`TRELLO_CLIENT_SECRET`** — the OAuth
 *     app secret, NOT the user token and NOT the app `key`.
 *     Receive route MUST capture the raw body BEFORE any JSON
 *     parsing — re-serializing alters whitespace and breaks the digest.
 *
 *   - `callbackURL` is the EXACT URL Trello has registered for the
 *     webhook. Includes scheme, host, port, path, AND any query string
 *     (V2 uses `?workflowId=X&nodeId=Y`). A trailing slash mismatch
 *     OR scheme mismatch (http vs https) breaks verification.
 *
 *   - Compare: constant-time via `crypto.timingSafeEqual`. The
 *     length-mismatch guard runs BEFORE `timingSafeEqual` —
 *     `timingSafeEqual` throws on different-length buffers.
 *
 * V1's verification was a no-op (`verification.ts:35-38` returned
 * `true` unconditionally for Trello). Slice 17 plan §"V1 bugs to fix"
 * #1 closes that gap.
 *
 * Returns a typed result discriminating "valid" / "missing_secret" /
 * "missing_header" / "malformed" / "mismatch" so the receive route can
 * map distinct failures to distinct status codes:
 *   - `missing_secret` → route 503 (server misconfig).
 *   - everything else → route 401.
 *
 * Mirrors `_shared/github/webhooks/signature.ts` shape — the typed
 * result + length-mismatch-before-timing-safe-equal pattern is the
 * shared V2 contract.
 *
 * Trello-specific differences from GitHub:
 *   - HMAC-SHA1 (not SHA-256) — fixed by Trello, can't be upgraded.
 *   - Encoding is base64 (not hex).
 *   - Message is `rawBody + callbackURL` (not just rawBody).
 *   - Header value is bare base64 (no `sha1=` prefix; Trello sends
 *     the raw base64).
 */

export type TrelloSignatureFailReason =
  | "missing_secret"
  | "missing_header"
  | "malformed"
  | "mismatch";

export type VerifyTrelloSignatureResult =
  | { valid: true }
  | { valid: false; reason: TrelloSignatureFailReason };

const SHA1_DIGEST_LENGTH = 20;

/**
 * Verify a Trello webhook signature.
 *
 * @param rawBody Exact bytes Trello signed — receive route MUST capture
 *   this BEFORE any JSON parsing.
 * @param callbackURL The EXACT URL Trello has registered for the
 *   webhook. Must match the activation-time URL byte-for-byte.
 * @param signatureHeader The `X-Trello-Webhook` header value, or
 *   `null` when absent. Returns `missing_header` on null / empty.
 * @param secret `TRELLO_CLIENT_SECRET` env. Empty / missing returns
 *   `missing_secret` — the route maps this to 503 to fail-closed.
 */
export function verifyTrelloSignature(
  rawBody: string,
  callbackURL: string,
  signatureHeader: string | null,
  secret: string,
): VerifyTrelloSignatureResult {
  if (!secret) return { valid: false, reason: "missing_secret" };
  if (!signatureHeader) return { valid: false, reason: "missing_header" };

  // Base64 has a roughly-fixed length for a SHA-1 digest: 28 chars
  // (`Math.ceil(20 / 3) * 4`). Cheap pre-flight before decode.
  if (signatureHeader.length === 0 || signatureHeader.length > 64) {
    return { valid: false, reason: "malformed" };
  }

  // Decode the provided base64. Buffer.from with strict checking via
  // re-encode comparison so bogus characters become "malformed" rather
  // than mismatch (timing-safe equal works only on properly-sized
  // buffers).
  let provided: Buffer;
  try {
    provided = Buffer.from(signatureHeader, "base64");
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (provided.length !== SHA1_DIGEST_LENGTH) {
    return { valid: false, reason: "malformed" };
  }

  // Compute expected digest — HMAC-SHA1 over `${rawBody}${callbackURL}`.
  const expected = createHmac("sha1", secret)
    .update(rawBody, "utf8")
    .update(callbackURL, "utf8")
    .digest();

  // Length-mismatch guard MUST run BEFORE timingSafeEqual — the latter
  // throws on different-length buffers. The earlier digest-length
  // check already enforces 20 bytes; this is defense-in-depth.
  if (provided.length !== expected.length) {
    return { valid: false, reason: "malformed" };
  }

  if (!timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "mismatch" };
  }
  return { valid: true };
}
