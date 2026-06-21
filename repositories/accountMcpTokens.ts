import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for `account_mcp_tokens` (Slice 4.PUBLIC-MCP-1).
 *
 * Service-role only. There is NO `authenticated` GRANT on the table (the verify
 * material `token_hash` must never be client-readable), so ALL reads flow through
 * here and return one of two shapes:
 *
 *   - `McpTokenMetadata` — the CLIENT-FACING DTO. Structurally OMITS `token_hash`;
 *     this is what management routes + the Settings UI ever see.
 *   - `McpTokenVerificationRecord` — SERVICE-SIDE ONLY. Includes `tokenHash` for the
 *     public-endpoint bearer guard AND `createdByUserId` for the per-request
 *     membership re-check. Never returned to a client.
 *
 * The raw token is NEVER stored here — the management service generates it via
 * core/mcp/token and passes `prefix` + `tokenHash`.
 */

/** Client-facing metadata — NEVER includes `token_hash` or the raw token. */
export interface McpTokenMetadata {
  id: string;
  accountId: string;
  createdByUserId: string | null;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Service-side verification record — includes `tokenHash` + `createdByUserId`.
 * NEVER sent to a client. `createdByUserId` anchors the per-request membership
 * re-check (the verify path confirms this user is still a member of the account).
 */
export interface McpTokenVerificationRecord {
  id: string;
  accountId: string;
  createdByUserId: string | null;
  /** Non-secret display prefix — safe to snapshot onto audit rows. */
  prefix: string;
  tokenHash: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
}

interface AccountMcpTokensRow {
  id: string;
  account_id: string;
  created_by_user_id: string | null;
  name: string;
  prefix: string;
  token_hash: string;
  scopes: string[] | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Client-facing projection — drops `token_hash` (and `updated_at`). */
function rowToMetadata(row: AccountMcpTokensRow): McpTokenMetadata {
  return {
    id: row.id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes ?? [],
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/** Service-side projection — keeps `token_hash` + `created_by_user_id` for verify. */
function rowToVerification(row: AccountMcpTokensRow): McpTokenVerificationRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    prefix: row.prefix,
    tokenHash: row.token_hash,
    scopes: row.scopes ?? [],
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

/** Columns selected for the client-facing DTO — `token_hash` is deliberately absent. */
const METADATA_COLUMNS =
  "id, account_id, created_by_user_id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at";

/** Columns selected for verification — includes hash + minter, NEVER sent to client. */
const VERIFICATION_COLUMNS =
  "id, account_id, created_by_user_id, prefix, token_hash, scopes, expires_at, revoked_at";

export interface CreateMcpTokenInput {
  accountId: string;
  createdByUserId: string | null;
  name: string;
  prefix: string;
  tokenHash: string;
  scopes: string[];
  expiresAt?: string | null;
}

/**
 * Insert a new token row from a caller-generated `prefix` + `tokenHash` (the raw
 * token is never passed here). Returns the client-facing metadata DTO — NOT the
 * hash. The caller is responsible for revealing the raw token it generated, once.
 */
export async function createMcpTokenMetadataServiceRole(
  input: CreateMcpTokenInput,
): Promise<McpTokenMetadata> {
  const supabase = getServiceRoleClient(
    `account_mcp_tokens: create ${input.accountId}/${input.prefix}`,
  );
  const { data, error } = await supabase
    .from("account_mcp_tokens")
    .insert({
      account_id: input.accountId,
      created_by_user_id: input.createdByUserId,
      name: input.name,
      prefix: input.prefix,
      token_hash: input.tokenHash,
      scopes: input.scopes,
      expires_at: input.expiresAt ?? null,
    })
    .select(METADATA_COLUMNS)
    .single<AccountMcpTokensRow>();
  if (error || !data) {
    throw new Error(
      `account_mcp_tokens.createMcpTokenMetadataServiceRole failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToMetadata(data);
}

/** All tokens for an account (any status), newest first — metadata only (no hash). */
export async function listMcpTokenMetadataByAccountServiceRole(
  accountId: string,
): Promise<readonly McpTokenMetadata[]> {
  const supabase = getServiceRoleClient(`account_mcp_tokens: listByAccount ${accountId}`);
  const { data, error } = await supabase
    .from("account_mcp_tokens")
    .select(METADATA_COLUMNS)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(
      `account_mcp_tokens.listMcpTokenMetadataByAccountServiceRole failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => rowToMetadata(r as AccountMcpTokensRow));
}

/**
 * Fetch a single token's metadata scoped to its account (revoke existence check).
 * Account-scoped so a token id from another account resolves to null — the caller
 * maps that to a 404 with no cross-account existence leak. Metadata only (no hash).
 */
export async function getMcpTokenMetadataByIdServiceRole(
  accountId: string,
  tokenId: string,
): Promise<McpTokenMetadata | null> {
  const supabase = getServiceRoleClient(
    `account_mcp_tokens: getById ${accountId}/${tokenId}`,
  );
  const { data, error } = await supabase
    .from("account_mcp_tokens")
    .select(METADATA_COLUMNS)
    .eq("id", tokenId)
    .eq("account_id", accountId)
    .maybeSingle<AccountMcpTokensRow>();
  if (error) {
    throw new Error(`account_mcp_tokens.getMcpTokenMetadataByIdServiceRole failed: ${error.message}`);
  }
  return data ? rowToMetadata(data) : null;
}

/**
 * Verification lookup by the non-secret `prefix`. Returns NON-revoked candidates
 * incl. hash + minter; the caller confirms with a constant-time hash compare. The
 * repo filters `revoked_at IS NULL`, so a revoked token collapses to "no candidate"
 * — the same opaque failure as an unknown token (no revoked/unknown oracle).
 */
export async function getMcpTokenForVerificationByPrefixServiceRole(
  prefix: string,
): Promise<readonly McpTokenVerificationRecord[]> {
  const supabase = getServiceRoleClient("account_mcp_tokens: getByPrefix");
  const { data, error } = await supabase
    .from("account_mcp_tokens")
    .select(VERIFICATION_COLUMNS)
    .eq("prefix", prefix)
    .is("revoked_at", null);
  if (error) {
    throw new Error(
      `account_mcp_tokens.getMcpTokenForVerificationByPrefixServiceRole failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => rowToVerification(r as AccountMcpTokensRow));
}

/**
 * Soft revoke: set `revoked_at = now()` if not already revoked. Scoped to the
 * account so a token id from another account can never be revoked. Idempotent —
 * returns true if a row was newly revoked, false if already revoked / absent.
 */
export async function revokeMcpTokenServiceRole(input: {
  accountId: string;
  tokenId: string;
  now?: string;
}): Promise<{ revoked: boolean }> {
  const supabase = getServiceRoleClient(
    `account_mcp_tokens: revoke ${input.accountId}/${input.tokenId}`,
  );
  const { data, error } = await supabase
    .from("account_mcp_tokens")
    .update({ revoked_at: input.now ?? new Date().toISOString() })
    .eq("id", input.tokenId)
    .eq("account_id", input.accountId)
    .is("revoked_at", null)
    .select("id");
  if (error) {
    throw new Error(`account_mcp_tokens.revokeMcpTokenServiceRole failed: ${error.message}`);
  }
  return { revoked: (data ?? []).length > 0 };
}

/**
 * Best-effort `last_used_at` bump. Throttled: only writes when the stored value is
 * null or older than 60s, so a chatty token does not write per request. Callers
 * must NOT await this in the request path and should swallow errors — it can never
 * delay or fail an otherwise-successful request.
 */
export async function touchMcpTokenLastUsedServiceRole(input: {
  tokenId: string;
  now?: string;
}): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_mcp_tokens: touchLastUsed ${input.tokenId}`,
  );
  const now = input.now ?? new Date().toISOString();
  const cutoff = new Date(new Date(now).getTime() - 60_000).toISOString();
  const { error } = await supabase
    .from("account_mcp_tokens")
    .update({ last_used_at: now })
    .eq("id", input.tokenId)
    .or(`last_used_at.is.null,last_used_at.lt.${cutoff}`);
  if (error) {
    throw new Error(`account_mcp_tokens.touchMcpTokenLastUsedServiceRole failed: ${error.message}`);
  }
}
