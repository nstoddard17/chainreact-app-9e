import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Airtable webhook HMAC verification — Slice 10 Commit 4.
 *
 * Per current Airtable docs and V1's verified `validateAirtableSignature`
 * (lib/integrations/airtable/webhooks.ts:475-543):
 *
 *   - Header: `X-Airtable-Content-MAC: hmac-sha256=<hex>`.
 *     V1 also tolerates the bare hex value (no `hmac-sha256=` prefix)
 *     and base64-encoded signatures as defensive fallbacks. V2 follows
 *     the same defensive multi-encoding compare so signatures from
 *     older Airtable test environments still validate cleanly. Comma-
 *     separated multi-value headers (some proxies append values) are
 *     split and each candidate is tested.
 *
 *   - Algorithm: HMAC-SHA256 over the RAW request body (UTF-8 bytes;
 *     never re-serialize JSON before MACing — would break the digest).
 *     Key is the `macSecretBase64` returned by `POST
 *     /v0/bases/{baseId}/webhooks` at activation time, base64-decoded.
 *
 *   - Compare: constant-time via `crypto.timingSafeEqual`. Length-mismatch
 *     check happens BEFORE timingSafeEqual (which throws on length
 *     mismatch).
 *
 * Returns `true` only when at least one candidate decoding matches the
 * expected MAC. Missing macSecretBase64, missing header, malformed
 * decoding all return `false` without throwing.
 *
 * Mirrors `_shared/microsoft/webhooks/validation.ts` shape for cross-
 * provider consistency. Distinct from Microsoft's clientState scheme —
 * Airtable uses a real cryptographic MAC.
 */

const HEX_PREFIX = "hmac-sha256=";

/**
 * Pull every plausible signature candidate out of the raw header value.
 * Handles:
 *   - `hmac-sha256=<value>` (canonical Airtable format)
 *   - bare value (no prefix — defensive, V1 saw both)
 *   - comma-separated multi-value (proxies sometimes append)
 *   - whitespace-tolerant
 */
function extractCandidates(rawHeader: string): string[] {
  const out = new Set<string>();
  for (const segment of rawHeader.split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    out.add(trimmed);
    // Strip the `hmac-sha256=` prefix if present.
    if (trimmed.toLowerCase().startsWith(HEX_PREFIX)) {
      out.add(trimmed.slice(HEX_PREFIX.length).trim());
    } else {
      // Generic `<scheme>=<value>` form — capture the value half too.
      const equalsAt = trimmed.indexOf("=");
      if (equalsAt > 0 && equalsAt < trimmed.length - 1) {
        out.add(trimmed.slice(equalsAt + 1).trim());
      }
    }
  }
  return [...out].filter((s) => s.length > 0);
}

/**
 * Compare a candidate hex/base64 string against the expected MAC bytes
 * in constant time. Returns `false` on length mismatch or decoding
 * failure rather than throwing — encoding ambiguity is expected
 * (V1 tolerates both).
 */
function tryCompare(
  candidate: string,
  expectedBuffer: Buffer,
  encoding: "hex" | "base64",
): boolean {
  let provided: Buffer;
  try {
    provided = Buffer.from(candidate, encoding);
  } catch {
    return false;
  }
  // Buffer.from with invalid hex/base64 silently produces a partial /
  // truncated buffer rather than throwing. Length mismatch =
  // unambiguous "not this encoding".
  if (provided.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(provided, expectedBuffer);
}

/**
 * Verify an Airtable webhook signature against the raw request body.
 *
 * @param rawBody The exact bytes Airtable signed — the receive route
 *   MUST capture this BEFORE any JSON parsing (re-serializing would
 *   alter whitespace and break the digest).
 * @param signatureHeader The `X-Airtable-Content-MAC` header value, or
 *   `null` when absent. Returning `false` on null is intentional —
 *   the route maps this to a 401 in the same path as a mismatch,
 *   matching the user's Commit-4 spec (reject invalid signatures).
 * @param macSecretBase64 The base64-encoded HMAC key returned by
 *   `POST /v0/bases/{baseId}/webhooks` at activation time. Persisted
 *   in `trigger_resources.config.macSecretBase64`.
 */
export function verifyAirtableSignature(
  rawBody: string,
  signatureHeader: string | null,
  macSecretBase64: string,
): boolean {
  if (!signatureHeader || !macSecretBase64) return false;

  const candidates = extractCandidates(signatureHeader);
  if (candidates.length === 0) return false;

  // Compute the expected MAC. Airtable docs return the digest as hex,
  // but V1 tolerates either hex OR base64 in the header — we compute
  // both expected forms once and try each candidate against both.
  let key: Buffer;
  try {
    key = Buffer.from(macSecretBase64, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const hmac = createHmac("sha256", key);
  hmac.update(rawBody, "utf8");
  const digest = hmac.digest();
  // digest is the raw bytes; length is always 32 for SHA-256.

  for (const candidate of candidates) {
    if (tryCompare(candidate, digest, "hex")) return true;
    if (tryCompare(candidate, digest, "base64")) return true;
  }

  return false;
}
