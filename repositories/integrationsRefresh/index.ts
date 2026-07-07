import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";

/**
 * Refresh-scheduling + cross-instance-claim repository methods for the
 * `integrations` table (Phase 8 / OAUTH-REFRESH-RELIABILITY-1).
 *
 * Sibling module to `repositories/integrations.ts` — same table, same
 * service-role posture, but a deliberately NARROWER read surface: the token
 * refresh sweep never needs encrypted token material (the dispatcher re-reads
 * the row itself before calling the provider), so `listRefreshDueServiceRole`
 * returns a token-free DTO. Claim state is a random UUID + timestamp only.
 *
 * Server-side only, service-role only — the refresh cron and the refresh
 * claim wrapper run with no user session. Nothing here is ever returned to a
 * client.
 */

/**
 * Token-free projection of a row that is due for proactive refresh.
 * `hasRefreshToken` is derived from `refresh_token_encrypted IS NOT NULL`;
 * the ciphertext itself never leaves the query mapping.
 */
export interface RefreshDueRow {
  id: string;
  accountId: string;
  provider: string;
  providerAccountId: string;
  connectedByUserId: string | null;
  hasRefreshToken: boolean;
  /** ISO-8601 timestamptz — non-null by selection predicate. */
  accessTokenExpiresAt: string;
}

interface RefreshDueSqlRow {
  id: string;
  account_id: string;
  provider: string;
  provider_account_id: string;
  connected_by_user_id: string | null;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string;
}

/**
 * List ACTIVE rows whose access token is due for proactive refresh: expires
 * before `dueBeforeIso` (a now+window cutoff computed by the caller) or is
 * already expired.
 *
 * Exclusions, and why:
 *   - `needs_reconnect_at IS NOT NULL` — the row needs USER action (dead grant
 *     already detected); re-refreshing it every tick would spam the provider.
 *     The reconnect flow clears the mark and the row re-enters the sweep.
 *   - `access_token_expires_at IS NULL` — no expiry means nothing to refresh
 *     ahead of (Slack/Notion/GitHub-style non-expiring tokens); the reactive
 *     401 path remains their safety net.
 *
 * Provider refreshability is NOT filtered here on purpose — that
 * classification lives in the provider manifests (`integrations/_registry.ts`)
 * and must not be re-encoded in SQL. The sweep service classifies each row
 * against its manifest and counts non-refreshable rows without marking them.
 *
 * Ordered soonest-expiry-first so a bounded batch always handles the most
 * urgent rows.
 */
export async function listRefreshDueServiceRole(input: {
  dueBeforeIso: string;
  limit: number;
}): Promise<readonly RefreshDueRow[]> {
  const supabase = getServiceRoleClient(
    `token refresh sweep: listRefreshDue (limit ${input.limit})`,
  );
  const { data, error } = await supabase
    .from("integrations")
    .select(
      "id, account_id, provider, provider_account_id, connected_by_user_id, refresh_token_encrypted, access_token_expires_at",
    )
    .is("disconnected_at", null)
    .is("needs_reconnect_at", null)
    .not("access_token_expires_at", "is", null)
    .lte("access_token_expires_at", input.dueBeforeIso)
    .order("access_token_expires_at", { ascending: true })
    .limit(input.limit);
  if (error) {
    throw new Error(`integrations.listRefreshDueServiceRole failed: ${error.message}`);
  }
  return ((data ?? []) as RefreshDueSqlRow[]).map((row) => ({
    id: row.id,
    accountId: row.account_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    connectedByUserId: row.connected_by_user_id,
    hasRefreshToken: row.refresh_token_encrypted !== null,
    accessTokenExpiresAt: row.access_token_expires_at,
  }));
}

/**
 * Take the cross-instance refresh claim for ONE integration row. Conditional
 * UPDATE: succeeds only when the row is active AND no live claim exists
 * (`refresh_claim_id IS NULL`) or the existing claim is stale
 * (`refresh_claimed_at < staleBeforeIso`, i.e. the holder crashed past the
 * TTL). Returns true when THIS call took the claim. The row-level lock on the
 * UPDATE serializes concurrent claimers across instances, so exactly one wins.
 */
export async function claimRefresh(input: {
  integrationId: string;
  claimId: string;
  staleBeforeIso: string;
}): Promise<boolean> {
  const supabase = getServiceRoleClient(
    `oauth refresh: claimRefresh ${input.integrationId}`,
  );
  const { data, error } = await supabase
    .from("integrations")
    .update({
      refresh_claim_id: input.claimId,
      refresh_claimed_at: new Date().toISOString(),
    })
    .eq("id", input.integrationId)
    .is("disconnected_at", null)
    .or(`refresh_claim_id.is.null,refresh_claimed_at.lt.${input.staleBeforeIso}`)
    .select("id");
  if (error) {
    throw new Error(`integrations.claimRefresh failed: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Release the cross-instance refresh claim. Guarded by
 * `refresh_claim_id = claimId` so a claim that was TTL-stolen by another
 * instance is never cleared by the previous (slow or crashed-and-recovered)
 * holder. Idempotent — releasing an already-released claim matches zero rows.
 */
export async function releaseRefreshClaim(input: {
  integrationId: string;
  claimId: string;
}): Promise<void> {
  const supabase = getServiceRoleClient(
    `oauth refresh: releaseRefreshClaim ${input.integrationId}`,
  );
  const { error } = await supabase
    .from("integrations")
    .update({ refresh_claim_id: null, refresh_claimed_at: null })
    .eq("id", input.integrationId)
    .eq("refresh_claim_id", input.claimId);
  if (error) {
    throw new Error(`integrations.releaseRefreshClaim failed: ${error.message}`);
  }
}
