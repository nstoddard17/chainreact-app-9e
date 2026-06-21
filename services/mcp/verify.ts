import {
  parseBearerMcpToken,
  hashMcpToken,
  deriveMcpTokenPrefix,
  timingSafeEqualHex,
} from "@/core/mcp/token";
import { getMcpTokenForVerificationByPrefixServiceRole } from "@/repositories/accountMcpTokens";
import { getRoleServiceRole } from "@/repositories/accountMemberships";

/**
 * MCP bearer-token verification (Slice 4.PUBLIC-MCP-4).
 *
 * The auth primitive behind the PUBLIC MCP endpoint. Resolves an
 * `Authorization: Bearer crmcp_…` header to a verified context — and NOTHING else
 * (no session, no OAuth/integration token, no account internals). Pure token auth.
 *
 * Verification chain (fail-closed at each step; every failure is opaque to the
 * client — the route returns one generic 401):
 *   1. structural pre-check (`parseBearerMcpToken`)
 *   2. PREFIX lookup (service-role; the repo excludes revoked rows)
 *   3. constant-time hash compare (`timingSafeEqualHex`)
 *   4. expiry check
 *   5. MEMBERSHIP RE-CHECK — the token's minter must STILL be a member of the
 *      token's account (rule c). This makes a token die when its creator is removed
 *      from the account, even before the token is explicitly revoked. A null minter
 *      (deleted user) also fails here.
 *
 * The distinct `reason` is for structured logging only — it never reaches the
 * client and never carries the raw token or `token_hash`.
 */

export type VerifyMcpTokenFailureReason =
  | "missing" // no Authorization header
  | "malformed" // header present but not a well-formed `Bearer crmcp_…`
  | "invalid" // no active token matches (unknown OR revoked — indistinguishable)
  | "expired" // matched a token whose `expires_at` is in the past
  | "membership_revoked"; // token valid but its minter is no longer an account member

export interface VerifiedMcpToken {
  ok: true;
  tokenId: string;
  accountId: string;
  /** The token minter — still a verified member of `accountId` at this instant. */
  userId: string;
  prefix: string;
  scopes: string[];
}

export type VerifyMcpTokenResult =
  | VerifiedMcpToken
  | { ok: false; reason: VerifyMcpTokenFailureReason };

/**
 * Verify a raw `Authorization` header value. NEVER throws for an auth failure
 * (returns a non-`ok` result); only a genuine infra error from a repo propagates.
 * The raw token is never logged or returned; only the opaque `reason`.
 */
export async function verifyMcpToken(
  authorizationHeader: string | null | undefined,
): Promise<VerifyMcpTokenResult> {
  if (!authorizationHeader) return { ok: false, reason: "missing" };

  const raw = parseBearerMcpToken(authorizationHeader);
  if (!raw) return { ok: false, reason: "malformed" };

  const prefix = deriveMcpTokenPrefix(raw);
  const presentedHash = hashMcpToken(raw);

  // Prefix lookup returns only NON-revoked candidates (the repo filters
  // `revoked_at IS NULL`), so a revoked token collapses to "invalid" — same opaque
  // 401 as an unknown token. No revoked/unknown oracle.
  const candidates = await getMcpTokenForVerificationByPrefixServiceRole(prefix);

  const match = candidates.find((c) => timingSafeEqualHex(c.tokenHash, presentedHash));
  if (!match) return { ok: false, reason: "invalid" };

  if (match.expiresAt && new Date(match.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  // Membership re-check (rule c). A null minter has no anchor and fails closed.
  if (!match.createdByUserId) return { ok: false, reason: "membership_revoked" };
  const role = await getRoleServiceRole(match.accountId, match.createdByUserId);
  if (role === null) return { ok: false, reason: "membership_revoked" };

  return {
    ok: true,
    tokenId: match.id,
    accountId: match.accountId,
    userId: match.createdByUserId,
    prefix: match.prefix,
    scopes: match.scopes,
  };
}
