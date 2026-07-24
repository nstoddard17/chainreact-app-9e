import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Service-role teardown helpers for account purge (4.ACCOUNT-MODEL-10c).
 *
 * Cross-table destructive deletes live here in one place because purge is
 * inherently a multi-table operation ordered to satisfy the account_id
 * ON DELETE RESTRICT fences. Every function is service-role (purge runs from a
 * cron with no user session) and every delete is "delete WHERE present" so the
 * whole sequence is idempotent / retry-safe.
 *
 * FK facts this ordering relies on (verified against the migrations):
 *   - account_billing / workflows / integrations / workflow_runs .account_id →
 *     accounts: ON DELETE RESTRICT → must be deleted explicitly BEFORE the
 *     account row.
 *   - workflows children (workflow_revisions, trigger_resources, workflow_files,
 *     builder_agent_threads/messages) → ON DELETE CASCADE on workflow_id.
 *   - task_usage_events / ai_cost_events / billing_shadow_comparisons .account_id
 *     → accounts: ON DELETE CASCADE → cleaned automatically when the account row
 *     is deleted (this is why 10c needs no schema change; ledger
 *     anonymization/retention is 10d).
 *   - accounts.owner_user_id → auth.users: ON DELETE RESTRICT → auth.users must
 *     be deleted LAST, after the account row is gone.
 *   - user_profiles / oauth_states / notifications / account_memberships.user_id
 *     → auth.users: ON DELETE CASCADE → cleaned by the final auth.users delete.
 */

export interface PurgeIntegrationRow {
  id: string;
  provider: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string | null;
}

interface IntegrationsPurgeRow {
  id: string;
  provider: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
}

/**
 * Every integration row (active OR already-disconnected) owned by the account,
 * with its encrypted tokens, so the purge can best-effort revoke at the provider
 * before deleting. Disconnected rows are included: their tokens were never
 * revoked (10b disconnect is soft-only) and the row must still be removed to
 * clear the account_id RESTRICT.
 */
export async function listIntegrationsForPurge(
  accountId: string,
): Promise<readonly PurgeIntegrationRow[]> {
  const supabase = getServiceRoleClient(
    `account purge: list integrations for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("integrations")
    .select("id, provider, access_token_encrypted, refresh_token_encrypted")
    .eq("account_id", accountId);
  if (error) {
    throw new Error(`accountPurge.listIntegrationsForPurge failed: ${error.message}`);
  }
  return ((data ?? []) as IntegrationsPurgeRow[]).map((r) => ({
    id: r.id,
    provider: r.provider,
    accessTokenEncrypted: r.access_token_encrypted,
    refreshTokenEncrypted: r.refresh_token_encrypted,
  }));
}

/** Delete a single integration row by id. */
export async function deleteIntegration(integrationId: string): Promise<void> {
  const supabase = getServiceRoleClient(
    `account purge: delete integration ${integrationId}`,
  );
  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("id", integrationId);
  if (error) {
    throw new Error(`accountPurge.deleteIntegration failed: ${error.message}`);
  }
}

/** Delete all workflow_runs for the account (RESTRICT → explicit, before account). */
export async function deleteWorkflowRunsByAccount(accountId: string): Promise<number> {
  const supabase = getServiceRoleClient(
    `account purge: delete workflow_runs for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("workflow_runs")
    .delete()
    .eq("account_id", accountId)
    .select("id");
  if (error) {
    throw new Error(`accountPurge.deleteWorkflowRunsByAccount failed: ${error.message}`);
  }
  return (data ?? []).length;
}

/**
 * Delete all workflows for the account (RESTRICT → explicit, before account).
 * Cascades workflow_revisions, trigger_resources, workflow_files, and
 * builder_agent_threads/messages via their workflow_id ON DELETE CASCADE.
 */
export async function deleteWorkflowsByAccount(accountId: string): Promise<number> {
  const supabase = getServiceRoleClient(
    `account purge: delete workflows for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("workflows")
    .delete()
    .eq("account_id", accountId)
    .select("id");
  if (error) {
    throw new Error(`accountPurge.deleteWorkflowsByAccount failed: ${error.message}`);
  }
  return (data ?? []).length;
}

/** Delete the account_billing row (RESTRICT → explicit, before account). */
export async function deleteAccountBilling(accountId: string): Promise<void> {
  const supabase = getServiceRoleClient(
    `account purge: delete account_billing for account ${accountId}`,
  );
  const { error } = await supabase
    .from("account_billing")
    .delete()
    .eq("account_id", accountId);
  if (error) {
    throw new Error(`accountPurge.deleteAccountBilling failed: ${error.message}`);
  }
}

/**
 * Delete the account row itself. Cascades account_memberships (account_id) and
 * the account-owned ledgers (task_usage_events / ai_cost_events /
 * billing_shadow_comparisons via account_id ON DELETE CASCADE). Must run AFTER
 * the four RESTRICT children above are gone, and BEFORE the auth.users delete
 * (owner_user_id RESTRICT).
 */
export async function deleteAccount(accountId: string): Promise<void> {
  const supabase = getServiceRoleClient(
    `account purge: delete account ${accountId}`,
  );
  const { error } = await supabase.from("accounts").delete().eq("id", accountId);
  if (error) {
    throw new Error(`accountPurge.deleteAccount failed: ${error.message}`);
  }
}

/**
 * Delete the auth.users row LAST via the admin API. Cascades user_profiles,
 * oauth_states, notifications, and any residual account_memberships (user_id).
 * Idempotent: a "user not found" error is treated as success (a re-run after a
 * partially-completed purge must not fail here).
 */
export async function deleteAuthUser(userId: string): Promise<void> {
  const supabase = getServiceRoleClient(
    `account purge: delete auth user ${userId}`,
  );
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error && !/not.?found/i.test(error.message)) {
    throw new Error(`accountPurge.deleteAuthUser failed: ${error.message}`);
  }
}

export interface DuePendingAccount {
  accountId: string;
  ownerUserId: string;
}

/**
 * Accounts that are `pending_deletion` AND whose grace window has elapsed
 * (`purge_after <= now`). The purge cron's worklist. Active accounts and
 * still-in-grace pending accounts are never returned — the core correctness
 * guard for "never purge an account that shouldn't be purged."
 */
/**
 * Every account currently in `pending_deletion`, regardless of whether its grace window has
 * elapsed (ACCOUNT-BILLING-LIFECYCLE-1). The billing-reconciliation sweep's worklist: an
 * account that asked to be deleted must stop being billed NOW, not in 30 days, so this
 * deliberately has no `purge_after` filter. Ids only — the sweep performs no data teardown.
 */
export async function listPendingDeletionAccounts(): Promise<readonly string[]> {
  const supabase = getServiceRoleClient(
    "account billing reconcile: list pending-deletion accounts",
  );
  const { data, error } = await supabase
    .from("accounts")
    .select("id")
    .eq("deletion_status", "pending_deletion");
  if (error) {
    throw new Error(
      `accountPurge.listPendingDeletionAccounts failed: ${error.message}`,
    );
  }
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

export async function listDuePendingAccounts(
  now: string,
): Promise<readonly DuePendingAccount[]> {
  const supabase = getServiceRoleClient(
    "account purge: list due pending-deletion accounts",
  );
  const { data, error } = await supabase
    .from("accounts")
    .select("id, owner_user_id")
    .eq("deletion_status", "pending_deletion")
    .lte("purge_after", now);
  if (error) {
    throw new Error(`accountPurge.listDuePendingAccounts failed: ${error.message}`);
  }
  return ((data ?? []) as Array<{ id: string; owner_user_id: string }>).map((r) => ({
    accountId: r.id,
    ownerUserId: r.owner_user_id,
  }));
}
