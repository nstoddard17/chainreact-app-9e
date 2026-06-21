import { generateMcpToken } from "@/core/mcp/token";
import { validateMcpScopes, LAUNCH_ENABLED_MCP_SCOPES } from "@/core/mcp/scopes";
import { isAccountFrozen } from "@/services/accounts/accountFreeze";
import * as mcpTokensRepo from "@/repositories/accountMcpTokens";
import type { McpTokenMetadata } from "@/repositories/accountMcpTokens";

/**
 * MCP token management service (Slice 4.PUBLIC-MCP-5).
 *
 * The business logic behind the owner/admin-gated management routes (the route
 * layer owns the coarse `requireAccountRole(["owner","admin"])` gate and maps these
 * results to HTTP). Reads + writes go through the service-role repo
 * (`account_mcp_tokens` grants `authenticated` nothing); the RAW token is generated
 * here, returned EXACTLY ONCE by `createMcpToken`, and never stored or logged.
 *
 * No OAuth/integration token is ever read.
 */

/** Max length for a token's human label. Mirrors the display-name cap convention. */
export const MAX_MCP_TOKEN_NAME_LENGTH = 80;

export type McpTokenStatus = "active" | "revoked" | "expired";

/** Client-facing token metadata + a derived status (never includes `token_hash`). */
export interface McpTokenMetadataWithStatus extends McpTokenMetadata {
  status: McpTokenStatus;
}

function deriveStatus(token: McpTokenMetadata, nowMs: number): McpTokenStatus {
  if (token.revokedAt) return "revoked";
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= nowMs) return "expired";
  return "active";
}

function withStatus(token: McpTokenMetadata): McpTokenMetadataWithStatus {
  return { ...token, status: deriveStatus(token, Date.now()) };
}

/** List an account's tokens (metadata only, newest first), each with a status. */
export async function listMcpTokens(input: {
  accountId: string;
}): Promise<McpTokenMetadataWithStatus[]> {
  const rows = await mcpTokensRepo.listMcpTokenMetadataByAccountServiceRole(input.accountId);
  return rows.map(withStatus);
}

export type CreateMcpTokenReason =
  | "invalid_name"
  | "invalid_scopes"
  | "scope_not_enabled"
  | "invalid_expiry"
  | "account_frozen";

export type CreateMcpTokenResult =
  | { ok: true; token: McpTokenMetadataWithStatus; rawToken: string }
  | { ok: false; reason: CreateMcpTokenReason };

/**
 * Mint a new MCP token. Validates name + scopes (launch-enabled only) + optional
 * expiry, refuses on a frozen account, generates a high-entropy token, stores ONLY
 * its hash + prefix, and returns the raw token ONCE. The caller (route) reveals
 * `rawToken` to the owner/admin exactly once; it is never persisted, returned
 * again, or logged. When `scopes` is empty/omitted it defaults to all read scopes.
 */
export async function createMcpToken(input: {
  accountId: string;
  createdByUserId: string;
  name: string;
  scopes?: string[];
  expiresAt?: string | null;
}): Promise<CreateMcpTokenResult> {
  const name = (input.name ?? "").trim();
  if (name.length === 0 || name.length > MAX_MCP_TOKEN_NAME_LENGTH) {
    return { ok: false, reason: "invalid_name" };
  }

  const requestedScopes =
    input.scopes && input.scopes.length > 0 ? input.scopes : [...LAUNCH_ENABLED_MCP_SCOPES];
  const scopeCheck = validateMcpScopes(requestedScopes);
  if (!scopeCheck.ok) {
    return {
      ok: false,
      reason: scopeCheck.reason === "scope_not_enabled" ? "scope_not_enabled" : "invalid_scopes",
    };
  }

  let expiresAt: string | null = null;
  if (input.expiresAt != null) {
    const t = new Date(input.expiresAt).getTime();
    if (Number.isNaN(t) || t <= Date.now()) return { ok: false, reason: "invalid_expiry" };
    expiresAt = new Date(t).toISOString();
  }

  if (await isAccountFrozen(input.accountId)) return { ok: false, reason: "account_frozen" };

  // The caller never supplies prefix/hash/createdBy/revokedAt/lastUsedAt — they are
  // derived here / by the DB, so a client can't forge any of them.
  const generated = generateMcpToken();
  const meta = await mcpTokensRepo.createMcpTokenMetadataServiceRole({
    accountId: input.accountId,
    createdByUserId: input.createdByUserId,
    name,
    prefix: generated.prefix,
    tokenHash: generated.tokenHash,
    scopes: scopeCheck.scopes,
    expiresAt,
  });

  // Structured ops log — prefix + ids only, NEVER the raw token or hash.
  console.info(
    JSON.stringify({
      event: "mcp_token.created",
      accountId: input.accountId,
      tokenId: meta.id,
      prefix: meta.prefix,
      actorUserId: input.createdByUserId,
      scopes: meta.scopes,
    }),
  );

  return { ok: true, token: withStatus(meta), rawToken: generated.raw };
}

export type RevokeMcpTokenReason = "not_found" | "account_frozen";

export type RevokeMcpTokenResult =
  | { ok: true; alreadyRevoked: boolean }
  | { ok: false; reason: RevokeMcpTokenReason };

/**
 * Soft-revoke a token, account-scoped + idempotent. A token id that does NOT belong
 * to the account resolves to `not_found` (a 404 the route returns identically
 * whether the token is cross-account or nonexistent — no existence leak). An
 * already-revoked token in the account returns `alreadyRevoked: true`. Refuses on a
 * frozen account.
 */
export async function revokeMcpToken(input: {
  accountId: string;
  tokenId: string;
}): Promise<RevokeMcpTokenResult> {
  if (await isAccountFrozen(input.accountId)) return { ok: false, reason: "account_frozen" };

  const { revoked } = await mcpTokensRepo.revokeMcpTokenServiceRole({
    accountId: input.accountId,
    tokenId: input.tokenId,
  });
  if (revoked) {
    console.info(
      JSON.stringify({
        event: "mcp_token.revoked",
        accountId: input.accountId,
        tokenId: input.tokenId,
      }),
    );
    return { ok: true, alreadyRevoked: false };
  }

  // Not newly revoked → distinguish "already revoked in this account" (idempotent)
  // from "not in this account" (404, no cross-account existence leak).
  const existing = await mcpTokensRepo.getMcpTokenMetadataByIdServiceRole(
    input.accountId,
    input.tokenId,
  );
  if (existing) return { ok: true, alreadyRevoked: true };
  return { ok: false, reason: "not_found" };
}
