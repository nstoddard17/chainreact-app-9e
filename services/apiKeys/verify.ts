import {
  parseBearerApiKey,
  hashApiKey,
  deriveApiKeyPrefix,
  timingSafeEqualHex,
} from "@/core/apiKeys/keys";
import { getApiKeyForVerificationByPrefixServiceRole } from "@/repositories/accountApiKeys";

/**
 * API-key bearer verification (Slice 4.API-KEYS-FOUNDATION-5 / FK-4).
 *
 * The auth primitive behind the PUBLIC trigger endpoint. Resolves an
 * `Authorization: Bearer crk_…` header to `{ keyId, accountId, scopes }` — and
 * NOTHING else (no user, no session, no OAuth/integration token, no account
 * internals). Pure key-auth: there is no Supabase cookie session on this path.
 *
 * Lookup strategy (foundation plan §6): cheap structural pre-check → PREFIX lookup
 * (service-role; the repo excludes revoked rows) → constant-time hash compare via
 * `timingSafeEqualHex`. SHA-256 is deterministic so the presented key's hash is an
 * exact match against the stored `key_hash`; the prefix narrows the candidate set
 * (normally to one) without ever trusting the non-secret prefix to authenticate.
 *
 * Fail-closed + opaque: a missing / malformed / unknown / revoked / expired key
 * all resolve to a NON-`ok` result. The caller maps EVERY non-`ok` reason to the
 * SAME generic 401 (no existence / active oracle). The distinct `reason` is for
 * structured logging only — it never reaches the client and never carries the raw
 * key or `key_hash`.
 */

export type VerifyApiKeyFailureReason =
  | "missing" // no Authorization header
  | "malformed" // header present but not a well-formed `Bearer crk_…`
  | "invalid" // no active key matches (unknown OR revoked — indistinguishable, by design)
  | "expired"; // matched a key whose `expires_at` is in the past

export type VerifyApiKeyResult =
  | { ok: true; keyId: string; accountId: string; prefix: string; scopes: string[] }
  | { ok: false; reason: VerifyApiKeyFailureReason };

/**
 * Verify a raw `Authorization` header value. NEVER throws for an auth failure
 * (returns a non-`ok` result); only a genuine infra error from the repo
 * propagates. The raw key is never logged or returned; only the opaque `reason`.
 */
export async function verifyApiKey(
  authorizationHeader: string | null | undefined,
): Promise<VerifyApiKeyResult> {
  if (!authorizationHeader) return { ok: false, reason: "missing" };

  const raw = parseBearerApiKey(authorizationHeader);
  if (!raw) return { ok: false, reason: "malformed" };

  const prefix = deriveApiKeyPrefix(raw);
  const presentedHash = hashApiKey(raw);

  // Prefix lookup returns only NON-revoked candidates (the repo filters
  // `revoked_at IS NULL`), so a revoked key collapses to "invalid" — same opaque
  // 401 as an unknown key. No revoked/unknown oracle.
  const candidates = await getApiKeyForVerificationByPrefixServiceRole(prefix);

  const match = candidates.find((c) => timingSafeEqualHex(c.keyHash, presentedHash));
  if (!match) return { ok: false, reason: "invalid" };

  if (match.expiresAt && new Date(match.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    keyId: match.id,
    accountId: match.accountId,
    prefix: match.prefix,
    scopes: match.scopes,
  };
}
