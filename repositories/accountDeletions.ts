import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for `account_deletions` — the durable deletion audit ledger
 * (4.ACCOUNT-MODEL-10b). Rows outlive the account AND the user (no FKs), store
 * NO user content, and record only the lifecycle of a deletion request.
 *
 * All writes are service-role (the deletion flow runs server-side). Reads here
 * are also service-role; the subject user reads their own rows directly through
 * RLS (`account_deletions_select_subject`) when the UI needs them (10e).
 */

export type AccountDeletionStatus = "pending" | "cancelled" | "purged";

export interface AccountDeletionRecord {
  id: string;
  accountId: string;
  ownerUserId: string;
  status: AccountDeletionStatus;
  requestedAt: string;
  requestedByUserId: string | null;
  purgeAfter: string;
  cancelledAt: string | null;
  purgedAt: string | null;
}

interface AccountDeletionsRow {
  id: string;
  account_id: string;
  owner_user_id: string;
  status: AccountDeletionStatus;
  requested_at: string;
  requested_by_user_id: string | null;
  purge_after: string;
  cancelled_at: string | null;
  purged_at: string | null;
}

function rowToRecord(row: AccountDeletionsRow): AccountDeletionRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    ownerUserId: row.owner_user_id,
    status: row.status,
    requestedAt: row.requested_at,
    requestedByUserId: row.requested_by_user_id,
    purgeAfter: row.purge_after,
    cancelledAt: row.cancelled_at,
    purgedAt: row.purged_at,
  };
}

/** Append a new `pending` deletion-audit row. */
export async function insertPending(input: {
  accountId: string;
  ownerUserId: string;
  requestedByUserId: string | null;
  requestedAt: string;
  purgeAfter: string;
}): Promise<AccountDeletionRecord> {
  const supabase = getServiceRoleClient(
    `account_deletions: insertPending for account ${input.accountId}`,
  );
  const { data, error } = await supabase
    .from("account_deletions")
    .insert({
      account_id: input.accountId,
      owner_user_id: input.ownerUserId,
      status: "pending",
      requested_at: input.requestedAt,
      requested_by_user_id: input.requestedByUserId,
      purge_after: input.purgeAfter,
    })
    .select()
    .single<AccountDeletionsRow>();
  if (error || !data) {
    throw new Error(
      `account_deletions.insertPending failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRecord(data);
}

/**
 * Mark every still-`pending` audit row for an account as `cancelled`. The
 * single-pending invariant means this is normally one row; updating the set is
 * the safe, idempotent way to settle a cancel.
 */
export async function markPendingCancelled(
  accountId: string,
  cancelledAt: string,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_deletions: markPendingCancelled for account ${accountId}`,
  );
  const { error } = await supabase
    .from("account_deletions")
    .update({ status: "cancelled", cancelled_at: cancelledAt })
    .eq("account_id", accountId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`account_deletions.markPendingCancelled failed: ${error.message}`);
  }
}

/**
 * Mark every still-`pending` audit row for an account as `purged`, stamping
 * counts + timestamp. Idempotent (filtered to `status='pending'`); a re-run
 * after the row is already purged updates nothing.
 */
export async function markPurged(input: {
  accountId: string;
  purgedAt: string;
  counts: Record<string, number | boolean>;
}): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_deletions: markPurged for account ${input.accountId}`,
  );
  const { error } = await supabase
    .from("account_deletions")
    .update({
      status: "purged",
      purged_at: input.purgedAt,
      purge_counts: input.counts,
    })
    .eq("account_id", input.accountId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`account_deletions.markPurged failed: ${error.message}`);
  }
}

/**
 * The owner_user_id of the latest still-`pending` audit row for an account that
 * no longer exists — the recovery key for a purge that died after the account
 * row was deleted but before auth.users was. Returns null when there is no such
 * pending row.
 */
export async function getPendingOwnerForOrphanedAccount(
  accountId: string,
): Promise<string | null> {
  const supabase = getServiceRoleClient(
    `account_deletions: getPendingOwner for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_deletions")
    .select("owner_user_id")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ owner_user_id: string }>();
  if (error) {
    throw new Error(
      `account_deletions.getPendingOwnerForOrphanedAccount failed: ${error.message}`,
    );
  }
  return data ? data.owner_user_id : null;
}

/** Read the most recent audit row for an account (service-role). */
export async function getLatestForAccount(
  accountId: string,
): Promise<AccountDeletionRecord | null> {
  const supabase = getServiceRoleClient(
    `account_deletions: getLatestForAccount for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("account_deletions")
    .select("*")
    .eq("account_id", accountId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle<AccountDeletionsRow>();
  if (error) {
    throw new Error(`account_deletions.getLatestForAccount failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}
