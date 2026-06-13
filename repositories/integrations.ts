import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";
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
  /**
   * Explicit connection-sharing scope (Slice 4.CONN-SHARE / CS-1). NULL = unset
   * = the derived `private_to_connector` default (see
   * `core/integrations/sharingScope.ts`). Additive + inert: no execution / DTO
   * path reads it yet; CS-2 is the first writer (the sharing toggle service).
   *
   * OPTIONAL on purpose: `rowToRecord` always populates it from the column, but
   * the many test fixtures that build an `IntegrationRecord` literal pre-date the
   * column and must keep compiling without it. Readers treat `undefined` exactly
   * like `null` (the helper `effectiveIntegrationSharingScope` accepts both).
   */
  integrationSharingScope?: string | null;
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
  integration_sharing_scope: string | null;
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
    integrationSharingScope: row.integration_sharing_scope ?? null,
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
 *
 * **Provenance pin (Slice 4.ACCOUNT-MODEL-22B):** `opts.connectedByUserId`
 * additionally filters `connected_by_user_id = $`. For PERSONAL-credential
 * providers in a Team account, `refreshAndRetry` passes the workflow creator's
 * id so a run can only resolve the credential its creator connected — never a
 * co-member's. Account/service providers pass nothing here and stay
 * account-shared. The filter is exact: a non-matching `connected_by_user_id`
 * returns null (no silent fallback to another member's row).
 *
 * **Determinism (22B):** results are ordered `created_at ASC` before `limit(1)`,
 * so when multiple active rows match (e.g. `providerAccountId` omitted and the
 * account has several rows for the provider) the *earliest-connected* row wins
 * deterministically — the previous no-ORDER-BY path returned an arbitrary row.
 */
export async function getActiveForExecution(
  accountId: string,
  provider: string,
  providerAccountId: string | null,
  opts?: { connectedByUserId?: string | null },
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
  if (opts?.connectedByUserId != null) {
    query = query.eq("connected_by_user_id", opts.connectedByUserId);
  }
  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<IntegrationsRow>();
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

/**
 * Service-role: the set of distinct user ids that have an ACTIVE connection for
 * `provider` in `accountId` (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-5B / CS-4b).
 *
 * Used to compute eligible reassignment targets (members who already have the
 * node's personal provider connected). Service-role on purpose: it answers a
 * presence question across members WITHOUT returning any integration row — only
 * the caller-side service maps these ids to display names, and the endpoint that
 * exposes them is owner/admin/creator-gated. NO token, label, or scope leaves
 * this query; it selects only `connected_by_user_id`.
 */
export async function listActiveConnectedUserIdsServiceRole(
  accountId: string,
  provider: string,
): Promise<ReadonlySet<string>> {
  const supabase = getServiceRoleClient(
    `integrations: listActiveConnectedUserIds for account ${accountId} / ${provider}`,
  );
  const { data, error } = await supabase
    .from("integrations")
    .select("connected_by_user_id")
    .eq("account_id", accountId)
    .eq("provider", provider)
    .is("disconnected_at", null);
  if (error) {
    throw new Error(`integrations.listActiveConnectedUserIdsServiceRole failed: ${error.message}`);
  }
  const ids = new Set<string>();
  for (const r of (data ?? []) as Array<{ connected_by_user_id: string | null }>) {
    if (r.connected_by_user_id) ids.add(r.connected_by_user_id);
  }
  return ids;
}

/**
 * Service-role: the set of distinct user ids that have an ACTIVE, EXPLICITLY
 * SHARED (`integration_sharing_scope = 'shared_with_account'`) connection for
 * `provider` in `accountId` (Slice 4.CONN-SHARE / CS-3a).
 *
 * Used to compute per-provider sharing status (0 = unshared, 1 = single
 * connector, 2+ = ambiguous) for the ambiguity-aware run/edit eligibility. The
 * CALLER (`computeWorkflowSharingEligibility`) consumes only the SIZE of this set
 * — the ids never leave the service. Selects ONLY `connected_by_user_id`; no
 * token, scope, provider_account_id, label, or metadata is read. The
 * `disconnected_at IS NULL` filter means disconnected shared rows are ignored.
 */
export async function listSharedConnectorUserIdsServiceRole(
  accountId: string,
  provider: string,
): Promise<ReadonlySet<string>> {
  const supabase = getServiceRoleClient(
    `integrations: listSharedConnectorUserIds for account ${accountId} / ${provider}`,
  );
  const { data, error } = await supabase
    .from("integrations")
    .select("connected_by_user_id")
    .eq("account_id", accountId)
    .eq("provider", provider)
    .eq("integration_sharing_scope", "shared_with_account")
    .is("disconnected_at", null);
  if (error) {
    throw new Error(`integrations.listSharedConnectorUserIdsServiceRole failed: ${error.message}`);
  }
  const ids = new Set<string>();
  for (const r of (data ?? []) as Array<{ connected_by_user_id: string | null }>) {
    if (r.connected_by_user_id) ids.add(r.connected_by_user_id);
  }
  return ids;
}

/**
 * Service-role: shared-connector user-id sets for MANY providers in ONE query
 * (CS-5b list-DTO batching). The single-provider `listSharedConnectorUserIdsServiceRole`
 * called per provider per workflow would be N×; this is one `provider IN (...)`
 * read for the whole dashboard. Returns a map provider → Set<connectorUserId>
 * (every requested provider is present, empty set when unshared). Selects ONLY
 * `provider` + `connected_by_user_id`; no token/scope/providerAccountId/label/
 * metadata. Same `shared_with_account` + `disconnected_at IS NULL` filter.
 */
export async function listSharedConnectorsByProviderServiceRole(
  accountId: string,
  providers: readonly string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (const p of providers) out.set(p, new Set<string>());
  if (providers.length === 0) return out;
  const supabase = getServiceRoleClient(
    `integrations: listSharedConnectorsByProvider for account ${accountId} (${providers.length})`,
  );
  const { data, error } = await supabase
    .from("integrations")
    .select("provider, connected_by_user_id")
    .eq("account_id", accountId)
    .in("provider", [...providers])
    .eq("integration_sharing_scope", "shared_with_account")
    .is("disconnected_at", null);
  if (error) {
    throw new Error(`integrations.listSharedConnectorsByProviderServiceRole failed: ${error.message}`);
  }
  for (const r of (data ?? []) as Array<{ provider: string; connected_by_user_id: string | null }>) {
    if (r.connected_by_user_id) out.get(r.provider)?.add(r.connected_by_user_id);
  }
  return out;
}

/**
 * Offboarding soft-disconnect (Slice 4.ACCOUNT-MODEL-22C).
 *
 * When a member is removed from a Team, the PERSONAL credentials they connected
 * inside that account must stop being usable by Team workflows. This soft-
 * disconnects (sets `disconnected_at`) every ACTIVE integration in `accountId`
 * whose `connected_by_user_id` is the removed member AND whose provider is a
 * personal-credential provider (see `core/integrations/credentialSharing.ts`).
 *
 * Deliberately scoped:
 *   - `account_id = $` — only THIS team's rows; the member's personal-account
 *     integrations (a different account_id) are untouched.
 *   - `connected_by_user_id = $` — only the removed member's rows; other
 *     members' credentials are untouched.
 *   - personal providers only — account/service providers (Slack / Notion /
 *     Stripe / …) represent shared org resources and stay connected.
 *
 * Idempotent: the SELECT and UPDATE both filter `disconnected_at IS NULL`, so a
 * second call (or a re-removal) is a no-op and returns count 0. Service-role:
 * operates on another user's rows; the caller (member-removal service) has
 * already authorized via `requireAccountRole`.
 */
export async function softDisconnectPersonalForMember(input: {
  accountId: string;
  connectedByUserId: string;
  now?: string;
}): Promise<{ disconnectedCount: number; disconnectedProviders: string[] }> {
  const supabase = getServiceRoleClient(
    `offboarding: softDisconnectPersonalForMember user ${input.connectedByUserId} on account ${input.accountId}`,
  );

  // 1. Active rows this member connected in this account.
  const { data, error } = await supabase
    .from("integrations")
    .select("id, provider")
    .eq("account_id", input.accountId)
    .eq("connected_by_user_id", input.connectedByUserId)
    .is("disconnected_at", null);
  if (error) {
    throw new Error(
      `integrations.softDisconnectPersonalForMember lookup failed: ${error.message}`,
    );
  }

  // 2. Keep only personal-credential providers (account/service stay connected).
  //    Classification, not a hardcoded list — unknown providers default personal.
  const personal = (data ?? []).filter((r) =>
    isPersonalCredentialProvider((r as { provider: string }).provider),
  ) as Array<{ id: string; provider: string }>;
  if (personal.length === 0) {
    return { disconnectedCount: 0, disconnectedProviders: [] };
  }

  // 3. Soft-disconnect by id. The `disconnected_at IS NULL` guard keeps it
  //    idempotent under a concurrent disconnect.
  const ids = personal.map((r) => r.id);
  const { error: updateErr } = await supabase
    .from("integrations")
    .update({ disconnected_at: input.now ?? new Date().toISOString() })
    .in("id", ids)
    .is("disconnected_at", null);
  if (updateErr) {
    throw new Error(
      `integrations.softDisconnectPersonalForMember update failed: ${updateErr.message}`,
    );
  }

  return {
    disconnectedCount: ids.length,
    disconnectedProviders: personal.map((r) => r.provider),
  };
}

/**
 * Service-role: fetch a single integration row by `(accountId, integrationId)`
 * for the authorized user-facing disconnect path (Slice 4.APPS-DISCONNECT / CD-1).
 *
 * The filter is exact on BOTH columns, so a row belonging to a different account
 * is invisible — `integrationId` from account B with `accountId = A` returns
 * null (no cross-account leak; the service maps null → `not_found`). Returns the
 * full record (incl. the encrypted access token) because the caller needs the
 * provider + provenance for authz and the encrypted token to best-effort revoke.
 *
 * Service-role on purpose: the disconnect service has already authorized the
 * caller's account role; the row read must also surface the encrypted token,
 * and the write path that follows operates by account, not by the session user.
 */
export async function getByIdForAccountServiceRole(
  accountId: string,
  integrationId: string,
): Promise<IntegrationRecord | null> {
  const supabase = getServiceRoleClient(
    `disconnect: getByIdForAccount ${integrationId} on account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("account_id", accountId)
    .maybeSingle<IntegrationsRow>();
  if (error) {
    throw new Error(`integrations.getByIdForAccountServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Service-role: set `integration_sharing_scope` on ONE active integration row
 * (Slice 4.CONN-SHARE / CS-2).
 *
 * `scope = 'shared_with_account'` opts the connection in; `scope = null` clears
 * it back to the unset / derived `private_to_connector` default (we never write
 * the literal `'private_to_connector'` — the column means "explicitly shared?"
 * and NULL is the unshared default).
 *
 * Guarded `disconnected_at IS NULL` — a disconnected row is NEVER mutated. If the
 * row was disconnected between the caller's resolve and this write (race), zero
 * rows match and `updated:false` is returned; the service maps that to a safe
 * `not_found`. Service-role: the sharing service has already authorized the
 * caller (connector-only share / connector-or-admin unshare) and operates by
 * account, not session. Touches no token columns.
 */
export async function setSharingScopeByIdServiceRole(input: {
  integrationId: string;
  scope: "shared_with_account" | null;
}): Promise<{ updated: boolean }> {
  const supabase = getServiceRoleClient(
    `connection sharing: setSharingScope ${input.integrationId}`,
  );
  const { data, error } = await supabase
    .from("integrations")
    .update({ integration_sharing_scope: input.scope })
    .eq("id", input.integrationId)
    .is("disconnected_at", null)
    .select("id");
  if (error) {
    throw new Error(`integrations.setSharingScopeByIdServiceRole failed: ${error.message}`);
  }
  return { updated: (data ?? []).length > 0 };
}

/**
 * Service-role: count ACTIVE integration rows for `(accountId, provider)`
 * (Slice 4.APPS-DISCONNECT / CD-1). Used AFTER a soft-disconnect to decide
 * whether the just-disconnected row was the LAST active connection for the
 * provider on this account — only then does the workflow cascade disable
 * provider-dependent workflows (a sibling active row can still resolve them).
 */
export async function countActiveByAccountProviderServiceRole(
  accountId: string,
  provider: string,
): Promise<number> {
  const supabase = getServiceRoleClient(
    `disconnect: countActiveByProvider ${provider} on account ${accountId}`,
  );
  const { count, error } = await supabase
    .from("integrations")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("provider", provider)
    .is("disconnected_at", null);
  if (error) {
    throw new Error(
      `integrations.countActiveByAccountProviderServiceRole failed: ${error.message}`,
    );
  }
  return count ?? 0;
}

/**
 * Service-role user-facing soft-disconnect of a single integration row
 * (Slice 4.APPS-DISCONNECT / CD-1). Replaces the former RLS-client
 * `markDisconnected` (dead code) — the disconnect service needs service-role
 * (it decrypts the token to revoke and operates by account, not session).
 *
 * Sets `disconnected_at` AND clears the NULLABLE token columns
 * (`refresh_token_encrypted`, `access_token_expires_at`) as defense-in-depth —
 * a disconnected row can never be re-tokened (`updateTokens` / `getActiveForExecution`
 * both filter `disconnected_at IS NULL`), so the refresh token on it is dead
 * weight. `access_token_encrypted` is `NOT NULL` in the schema (migration
 * 20260505000002) and CANNOT be nulled without a migration, so it is left as-is
 * — it stays AES-256-GCM encrypted, is never returned by any DTO, is never read
 * by execution (filtered out), and has been best-effort revoked at the provider.
 * Fully clearing it is a migration-gated follow-up (see CD-1 report).
 *
 * Idempotent: the `disconnected_at IS NULL` guard means a second call transitions
 * nothing. Returns `{ disconnected: true }` only when THIS call flipped the row,
 * so the service can skip the cascade/revoke on a replayed disconnect.
 */
export async function disconnectByIdServiceRole(input: {
  integrationId: string;
  now?: string;
}): Promise<{ disconnected: boolean }> {
  const supabase = getServiceRoleClient(
    `disconnect: disconnectById ${input.integrationId}`,
  );
  const { data, error } = await supabase
    .from("integrations")
    .update({
      disconnected_at: input.now ?? new Date().toISOString(),
      refresh_token_encrypted: null,
      access_token_expires_at: null,
    })
    .eq("id", input.integrationId)
    .is("disconnected_at", null)
    .select("id");
  if (error) {
    throw new Error(`integrations.disconnectByIdServiceRole failed: ${error.message}`);
  }
  return { disconnected: (data ?? []).length > 0 };
}
