import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type { EncryptedTokens, ProviderAccountInfo } from "@/contracts/integration";

/**
 * Repository for the integrations table.
 *
 * Per docs/rules/database-security.md and project-structure-and-module-boundaries.md:
 *   - Server-side only. Never imported by client code (lint guard enforces this).
 *   - All token columns are encrypted by the caller before reaching this layer.
 *     Repository never encrypts/decrypts; tokens come in already-encrypted from
 *     the OAuth handler and go out as-encrypted to be decrypted by services
 *     that explicitly need plaintext.
 *
 * Ownership model (post 4.ACCOUNT-MODEL-6 cutover):
 *   - `account_id` is the authoritative owner (FK to public.accounts).
 *   - `connected_by_user_id` carries provenance (the human who connected it).
 *   - `user_id` column does NOT exist on the table anymore.
 *
 * RLS: account-membership only. INSERT/UPDATE/DELETE happen through
 * service-role (OAuth dispatcher + this repository's disconnect path).
 */

export interface IntegrationRecord {
  id: string;
  /** V2 account that owns this integration. */
  accountId: string;
  /** Provenance: the human who completed the OAuth flow. */
  connectedByUserId: string | null;
  provider: string;
  providerAccountId: string;
  displayName: string | null;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
  /** ISO-8601 string from Postgres timestamptz, null if no expiry. */
  accessTokenExpiresAt: string | null;
  scopes: readonly string[];
  accountMetadata: Readonly<Record<string, unknown>>;
  disconnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertActiveInput {
  /** Owner account (V2). Required. */
  accountId: string;
  /**
   * The human who completed the OAuth flow. Provenance only; not used
   * for authorization. Nullable to match the column (ON DELETE SET NULL).
   */
  connectedByUserId: string;
  provider: string;
  providerAccountId: string;
  displayName: string | null;
  tokens: EncryptedTokens;
  accountMetadata: ProviderAccountInfo["metadata"];
}

interface IntegrationsRow {
  id: string;
  account_id: string;
  connected_by_user_id: string | null;
  provider: string;
  provider_account_id: string;
  display_name: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string | null;
  scopes: string[];
  account_metadata: Record<string, unknown>;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: IntegrationsRow): IntegrationRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    connectedByUserId: row.connected_by_user_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    displayName: row.display_name,
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    accessTokenExpiresAt: row.access_token_expires_at,
    scopes: row.scopes,
    accountMetadata: row.account_metadata,
    disconnectedAt: row.disconnected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function expiresAtIso(epochSeconds: number | null): string | null {
  if (epochSeconds === null) return null;
  return new Date(epochSeconds * 1000).toISOString();
}

/**
 * Insert a new active integration, or update the existing active row if one
 * exists for the (accountId, provider, providerAccountId) tuple. The unique
 * index `integrations_account_active_unique` on those three columns
 * (WHERE disconnected_at IS NULL) enforces at-most-one active row.
 *
 * Re-connection flow: if a previously-disconnected row exists, this function
 * inserts a new row rather than reviving the disconnected one — preserving
 * the disconnect history.
 *
 * Uses service-role: the only caller is the OAuth callback dispatcher, which
 * has already cryptographically verified the user identity via the signed
 * state token (which now also binds the target accountId). The HTTP request
 * hitting the callback was issued by the user's browser to a redirect URL —
 * the V2 session cookie may or may not be on that host (ngrok dev,
 * multi-domain prod), so the SSR-cookie client is unreliable here. Per
 * database-security.md §"Allowed flows" — system writes that have already
 * proved user identity out-of-band use service-role with an explicit reason
 * for audit.
 */
export async function upsertActive(input: UpsertActiveInput): Promise<IntegrationRecord> {
  const supabase = getServiceRoleClient(
    `oauth callback: upsertActive ${input.provider} for account ${input.accountId}`,
  );

  // Check for an existing ACTIVE row keyed by (account_id, provider, provider_account_id).
  const { data: existing, error: existingErr } = await supabase
    .from("integrations")
    .select("*")
    .eq("account_id", input.accountId)
    .eq("provider", input.provider)
    .eq("provider_account_id", input.providerAccountId)
    .is("disconnected_at", null)
    .maybeSingle<IntegrationsRow>();
  if (existingErr) {
    throw new Error(`integrations lookup failed: ${existingErr.message}`);
  }

  if (existing) {
    const { data, error } = await supabase
      .from("integrations")
      .update({
        // connected_by_user_id is preserved from the original connect on
        // an update — the provenance is "who first connected this", not
        // "who last re-authenticated". A re-connect from a different
        // member of the same account intentionally does NOT rewrite it.
        display_name: input.displayName,
        access_token_encrypted: input.tokens.accessTokenEncrypted,
        refresh_token_encrypted: input.tokens.refreshTokenEncrypted,
        access_token_expires_at: expiresAtIso(input.tokens.accessTokenExpiresAt),
        scopes: [...input.tokens.scopes],
        account_metadata: input.accountMetadata,
      })
      .eq("id", existing.id)
      .select()
      .single<IntegrationsRow>();
    if (error || !data) {
      throw new Error(`integrations update failed: ${error?.message ?? "no row returned"}`);
    }
    return rowToRecord(data);
  }

  const { data, error } = await supabase
    .from("integrations")
    .insert({
      account_id: input.accountId,
      connected_by_user_id: input.connectedByUserId,
      provider: input.provider,
      provider_account_id: input.providerAccountId,
      display_name: input.displayName,
      access_token_encrypted: input.tokens.accessTokenEncrypted,
      refresh_token_encrypted: input.tokens.refreshTokenEncrypted,
      access_token_expires_at: expiresAtIso(input.tokens.accessTokenExpiresAt),
      scopes: [...input.tokens.scopes],
      account_metadata: input.accountMetadata,
    })
    .select()
    .single<IntegrationsRow>();
  if (error || !data) {
    throw new Error(`integrations insert failed: ${error?.message ?? "no row returned"}`);
  }
  return rowToRecord(data);
}

/**
 * Engine path: look up the active integration for (accountId, provider,
 * providerAccountId) without a user session. Action handlers run in
 * background after a webhook returns 200, so the SSR-cookie client would
 * have no auth context — service-role bypasses RLS for this lookup.
 *
 * `providerAccountId` may be null — when omitted we return the first active
 * row for the (accountId, provider) pair, which is what action handlers do
 * when their trigger event has no account scope (manual / scheduled triggers).
 *
 * **Cross-account isolation:** the filter `account_id = $1` is exact. An
 * integration belonging to a different account is not visible regardless
 * of which user the workflow was created by. Handlers must pass
 * `input.accountId` (= workflow.account_id), not a derived user account.
 *
 * Returns null when nothing matches. Handlers map null to a clear "connect
 * <provider> first" error. Activation preconditions
 * (services/triggers/preconditions.ts) normally catch this upstream, but
 * the handler-level guard is defense-in-depth for the disconnect-while-
 * running race.
 */
export async function getActiveForExecution(
  accountId: string,
  provider: string,
  providerAccountId: string | null,
): Promise<IntegrationRecord | null> {
  const supabase = getServiceRoleClient(
    `action handler integration lookup: ${provider} for account ${accountId}`,
  );
  let query = supabase
    .from("integrations")
    .select("*")
    .eq("account_id", accountId)
    .eq("provider", provider)
    .is("disconnected_at", null);
  if (providerAccountId !== null) {
    query = query.eq("provider_account_id", providerAccountId);
  }
  const { data, error } = await query.limit(1).maybeSingle<IntegrationsRow>();
  if (error) {
    throw new Error(
      `integrations.getActiveForExecution failed: ${error.message}`,
    );
  }
  return data ? rowToRecord(data) : null;
}

export interface UpdateTokensInput {
  /** Integration row id (from getActiveForExecution / upsertActive). */
  id: string;
  tokens: EncryptedTokens;
}

/**
 * Atomically replace the token columns on an active integration row.
 * Used by the OAuth dispatcher's refresh path after a provider returns
 * fresh tokens.
 *
 * Filter: `id = $1 AND disconnected_at IS NULL`. A disconnected row can't
 * be silently re-tokened — that would resurrect dead state. If the row was
 * disconnected mid-refresh, the update returns no row and we throw a clear
 * error rather than write to a dead row.
 *
 * Refresh-token rotation policy: the provider's `refreshToken()` always
 * returns a populated `refreshTokenEncrypted` — providers that don't rotate
 * (Google default flow) re-encrypt and return the input refresh token.
 * Repository writes whatever the provider returned without inspecting it.
 *
 * Service-role: action handlers run in background after a webhook returns
 * 200, no user session — same rationale as `getActiveForExecution`.
 */
export async function updateTokens(input: UpdateTokensInput): Promise<IntegrationRecord> {
  const supabase = getServiceRoleClient(
    `oauth refresh: updateTokens for integration ${input.id}`,
  );
  const { data, error } = await supabase
    .from("integrations")
    .update({
      access_token_encrypted: input.tokens.accessTokenEncrypted,
      refresh_token_encrypted: input.tokens.refreshTokenEncrypted,
      access_token_expires_at: expiresAtIso(input.tokens.accessTokenExpiresAt),
      scopes: [...input.tokens.scopes],
    })
    .eq("id", input.id)
    .is("disconnected_at", null)
    .select()
    .single<IntegrationsRow>();
  if (error || !data) {
    throw new Error(
      `integrations.updateTokens failed: ${error?.message ?? "no row returned (row missing or disconnected)"}`,
    );
  }
  return rowToRecord(data);
}

/**
 * List the active integrations owned by an account. Used by the
 * integrations / apps list page and activation preconditions.
 *
 * Uses the SSR-cookie session client so RLS gates by account membership
 * — a member can see every active integration on every account they
 * belong to. Today there is one personal account per user; future
 * team/org accounts surface multiple.
 */
export async function listActiveByAccount(
  accountId: string,
): Promise<readonly IntegrationRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("account_id", accountId)
    .is("disconnected_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`integrations list failed: ${error.message}`);
  return (data ?? []).map((row) => rowToRecord(row as IntegrationsRow));
}

export async function markDisconnected(integrationId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("integrations")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("id", integrationId);
  if (error) throw new Error(`integrations markDisconnected failed: ${error.message}`);
}
