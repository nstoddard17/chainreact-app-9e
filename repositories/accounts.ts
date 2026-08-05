import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type {
  AccountRecord,
  AccountType,
  DeletionStatus,
} from "@/contracts/accounts";
import type { RpcArgs } from "@/types/rpc";

/**
 * Repository for `accounts`.
 *
 * Per docs/rules/account-ownership-model.md + the Phase A slice plan at
 * docs/slices/phase-4/account-model-foundation-plan.md, this is the only
 * place application code reads or writes account rows. The session client
 * (anon key) is used for reads — RLS gates visibility via membership.
 * Writes never go through the session client at this slice (no INSERT/
 * UPDATE/DELETE policies on `accounts`); the ensure helper uses
 * service-role explicitly.
 *
 * No app code outside tests imports this module in slice 4.ACCOUNT-MODEL-3.
 * Phase B+ slices wire it into workflow / integration / run / billing
 * read paths.
 */

interface AccountsRow {
  id: string;
  type: AccountType;
  name: string;
  owner_user_id: string;
  deletion_status: DeletionStatus;
  deletion_requested_at: string | null;
  deletion_requested_by: string | null;
  purge_after: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: AccountsRow): AccountRecord {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    ownerUserId: row.owner_user_id,
    deletionStatus: row.deletion_status,
    deletionRequestedAt: row.deletion_requested_at,
    purgeAfter: row.purge_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getById(accountId: string): Promise<AccountRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle<AccountsRow>();
  if (error) throw new Error(`accounts.getById failed: ${error.message}`);
  return data ? rowToRecord(data) : null;
}

/**
 * Canonical default-account resolver. Returns the personal account owned
 * by `userId` or null if (for some reason) it's missing. The signup
 * trigger normally guarantees one exists; null is the signal that the
 * caller should fall through to `ensurePersonalAccountServiceRole`.
 *
 * RLS guards visibility — a session call with another user's id returns
 * null because the membership-join predicate fails.
 */
export async function getPersonalAccountForUser(
  userId: string,
): Promise<AccountRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("type", "personal")
    .eq("owner_user_id", userId)
    .maybeSingle<AccountsRow>();
  if (error) {
    throw new Error(`accounts.getPersonalAccountForUser failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Lists every account the caller is a member of. RLS scopes the result
 * to the calling user's memberships automatically; passing a `userId`
 * other than `auth.uid()` returns an empty array.
 *
 * Used by the future account-switcher slice; included in this slice so
 * the repository has tests against the same code paths the switcher
 * will use.
 */
export async function listForUser(
  userId: string,
): Promise<readonly AccountRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*, account_memberships!inner(user_id)")
    .eq("account_memberships.user_id", userId);
  if (error) throw new Error(`accounts.listForUser failed: ${error.message}`);
  return (data ?? []).map((r) => rowToRecord(r as AccountsRow));
}

/**
 * Service-role: idempotent personal-account ensure. Returns the existing
 * personal account if one exists, otherwise creates it (plus the owner
 * membership) atomically and returns the new row. The two inserts
 * happen back-to-back; if the membership insert fails the migration's
 * personal-invariants trigger surfaces a stable error and the just-
 * inserted account is left orphaned for the deletion flow to reap. In
 * practice the membership insert can only fail if the account was
 * inserted twice between the SELECT and the INSERT, which a future
 * caller would detect by re-reading.
 *
 * Used by services/accounts/ensurePersonalAccount.ts as the fall-
 * through. Not wired into any production code path at this slice.
 */
export async function ensurePersonalAccountServiceRole(
  userId: string,
): Promise<AccountRecord> {
  const supabase = getServiceRoleClient(
    `accounts: ensurePersonalAccount for user ${userId}`,
  );

  // Fast path: row already exists.
  const { data: existing, error: readErr } = await supabase
    .from("accounts")
    .select("*")
    .eq("type", "personal")
    .eq("owner_user_id", userId)
    .maybeSingle<AccountsRow>();
  if (readErr) {
    throw new Error(
      `accounts.ensurePersonalAccountServiceRole read failed: ${readErr.message}`,
    );
  }
  if (existing) return rowToRecord(existing);

  // Insert the account.
  const { data: inserted, error: insertErr } = await supabase
    .from("accounts")
    .insert({ type: "personal", name: "Personal", owner_user_id: userId })
    .select()
    .single<AccountsRow>();
  if (insertErr || !inserted) {
    throw new Error(
      `accounts.ensurePersonalAccountServiceRole insert failed: ${insertErr?.message ?? "no row"}`,
    );
  }

  // Insert the owner membership. The personal-invariants trigger enforces
  // user_id = inserted.owner_user_id and role = 'owner'.
  const { error: memberErr } = await supabase
    .from("account_memberships")
    .insert({ account_id: inserted.id, user_id: userId, role: "owner" });
  if (memberErr) {
    throw new Error(
      `accounts.ensurePersonalAccountServiceRole membership insert failed: ${memberErr.message}`,
    );
  }

  return rowToRecord(inserted);
}

// ─── 4.ACCOUNT-MODEL-10b: deletion lifecycle (service-role) ───────────────────
//
// The deletion request/cancel flow runs server-side (self-serve route + admin /
// service-role path). These helpers use the service-role client so they work
// without a user session and bypass the account freeze RLS (a frozen account
// must still be readable + restorable by the flow). Purge itself is 10c.

// ─── 4.ACCOUNT-MODEL-13 (Phase D): team account creation (service-role) ───────

/**
 * Service-role: create a new `team` account owned by `ownerUserId`. Mirrors the
 * personal-account insert in `ensurePersonalAccountServiceRole`, but with
 * `type='team'` and NOT subject to the one-personal-per-user index, so a user
 * may own many teams. Caller (services/accounts/createTeamAccount.ts) also
 * inserts the owner membership + billing row. No client write path exists for
 * accounts — this is the only team-create writer.
 */
export async function createTeamAccountServiceRole(input: {
  name: string;
  ownerUserId: string;
}): Promise<AccountRecord> {
  const supabase = getServiceRoleClient(
    `accounts: createTeamAccount for user ${input.ownerUserId}`,
  );
  const { data, error } = await supabase
    .from("accounts")
    .insert({ type: "team", name: input.name, owner_user_id: input.ownerUserId })
    .select()
    .single<AccountsRow>();
  if (error || !data) {
    throw new Error(
      `accounts.createTeamAccountServiceRole failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRecord(data);
}

/** A minimal owned-account summary for the deletion-guard remediation (TL-4). */
export interface OwnedAccountSummary {
  id: string;
  name: string;
  /** Internal type — 'team' | 'organization'. The route maps it to a label. */
  type: AccountType;
}

/**
 * Service-role: id + name + type of every NON-personal account `userId` owns.
 * Backs the deletion guard — a user may not delete their personal account /
 * themselves while they solely own team/org accounts (the `owner_user_id
 * ON DELETE RESTRICT` FK would otherwise block the user purge). The guard
 * (4.ACCOUNT-MODEL-TRANSFER-LEAVE-5 / TL-4) returns these summaries so the user
 * can transfer or delete each. Empty array = clear to delete. Member counts are
 * intentionally omitted (not cheaply available without a second aggregate query).
 */
export async function listOwnedTeamOrgAccountSummaries(
  userId: string,
): Promise<OwnedAccountSummary[]> {
  const supabase = getServiceRoleClient(
    `accounts: listOwnedTeamOrgSummaries for user ${userId}`,
  );
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, type")
    .eq("owner_user_id", userId)
    .neq("type", "personal");
  if (error) {
    throw new Error(
      `accounts.listOwnedTeamOrgAccountSummaries failed: ${error.message}`,
    );
  }
  return ((data ?? []) as Array<{ id: string; name: string; type: AccountType }>).map(
    (r) => ({ id: r.id, name: r.name, type: r.type }),
  );
}

// ─── 4.ACCOUNT-MODEL-TRANSFER-LEAVE-2 / TL-1: owner transfer (service-role) ────

/**
 * Service-role: atomically transfer ownership of a team/org account via the
 * `transfer_account_ownership` SECURITY DEFINER RPC. The RPC validates the
 * account is team/org + active, that `currentOwnerUserId` is the present owner,
 * and that `targetUserId` is already a member; it then promotes the target to
 * `owner`, repoints `accounts.owner_user_id`, and demotes the old owner to
 * `admin` — all in one transaction guarded by the >=1-owner + owner-consistency
 * triggers. NOT a client-reachable path (the RPC is granted to service_role
 * only). The "transfer and leave" offboarding is layered on top by the TL-2
 * service, not here.
 */
export async function transferAccountOwnershipServiceRole(input: {
  accountId: string;
  currentOwnerUserId: string;
  targetUserId: string;
}): Promise<void> {
  const supabase = getServiceRoleClient(
    `accounts: transferOwnership account ${input.accountId} -> user ${input.targetUserId}`,
  );
  const { error } = await supabase.rpc("transfer_account_ownership", {
    p_account_id: input.accountId,
    p_current_owner_user_id: input.currentOwnerUserId,
    p_target_user_id: input.targetUserId,
  } satisfies RpcArgs<"transfer_account_ownership">);
  if (error) {
    throw new Error(
      `accounts.transferAccountOwnershipServiceRole failed: ${error.message}`,
    );
  }
}

/**
 * Service-role read of a single account by id. Mirrors `getById` but bypasses
 * RLS — the deletion service must resolve a frozen account that the session
 * client can no longer see through the operational policies.
 */
export async function getByIdServiceRole(
  accountId: string,
): Promise<AccountRecord | null> {
  const supabase = getServiceRoleClient(
    `accounts: getByIdServiceRole for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle<AccountsRow>();
  if (error) throw new Error(`accounts.getByIdServiceRole failed: ${error.message}`);
  return data ? rowToRecord(data) : null;
}

/**
 * Service-role read of a user's PERSONAL account (4.ACCOUNT-BILLING-LIFECYCLE-3).
 *
 * The sibling `getPersonalAccountForUser` uses the RLS/session client, so it can only ever
 * see the CALLER's own personal account — asking it about somebody else returns null, which
 * would be indistinguishable from "that user does not exist". Ownership-transfer eligibility
 * has to inspect the RECIPIENT's personal account, i.e. a different user's row, so it needs
 * this service-role read.
 *
 * Returns null when the user has no personal account at all — which, for a user id that
 * came from a membership row, means their identity is gone (purged) or was never
 * provisioned. Callers must treat null as INELIGIBLE, never as "fine".
 */
export async function getPersonalAccountForUserServiceRole(
  userId: string,
): Promise<AccountRecord | null> {
  const supabase = getServiceRoleClient(
    `accounts: getPersonalAccountForUser (service-role) for user ${userId}`,
  );
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("type", "personal")
    .eq("owner_user_id", userId)
    .maybeSingle<AccountsRow>();
  if (error) {
    throw new Error(
      `accounts.getPersonalAccountForUserServiceRole failed: ${error.message}`,
    );
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Service-role read of just the deletion status. Used by the freeze guards
 * (services/accounts/accountFreeze.ts) on background / service-role paths
 * (engine billing gate, OAuth refresh, activation) that RLS does not gate.
 * Returns null when the account does not exist.
 */
export async function getDeletionStatusServiceRole(
  accountId: string,
): Promise<DeletionStatus | null> {
  const supabase = getServiceRoleClient(
    `accounts: getDeletionStatus for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("accounts")
    .select("deletion_status")
    .eq("id", accountId)
    .maybeSingle<{ deletion_status: DeletionStatus }>();
  if (error) {
    throw new Error(`accounts.getDeletionStatusServiceRole failed: ${error.message}`);
  }
  return data ? data.deletion_status : null;
}

/**
 * Service-role: flip an account into `pending_deletion`, stamping the request
 * metadata + purge deadline. Does NOT write the audit row — the service
 * (services/accounts/accountDeletion.ts) orchestrates both so the audit insert
 * and the status flip stay together.
 */
export async function setDeletionPendingServiceRole(input: {
  accountId: string;
  requestedByUserId: string | null;
  requestedAt: string;
  purgeAfter: string;
}): Promise<AccountRecord> {
  const supabase = getServiceRoleClient(
    `accounts: setDeletionPending for account ${input.accountId}`,
  );
  const { data, error } = await supabase
    .from("accounts")
    .update({
      deletion_status: "pending_deletion",
      deletion_requested_at: input.requestedAt,
      deletion_requested_by: input.requestedByUserId,
      purge_after: input.purgeAfter,
    })
    .eq("id", input.accountId)
    .select()
    .single<AccountsRow>();
  if (error || !data) {
    throw new Error(
      `accounts.setDeletionPendingServiceRole failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRecord(data);
}

/**
 * Service-role: clear the deletion request, returning the account to `active`.
 * The reversible cancel/restore path. Workflows / integrations / runs are
 * untouched (no purge has happened), so the account is fully operational again.
 */
export async function clearDeletionServiceRole(
  accountId: string,
): Promise<AccountRecord> {
  const supabase = getServiceRoleClient(
    `accounts: clearDeletion for account ${accountId}`,
  );
  const { data, error } = await supabase
    .from("accounts")
    .update({
      deletion_status: "active",
      deletion_requested_at: null,
      deletion_requested_by: null,
      purge_after: null,
    })
    .eq("id", accountId)
    .select()
    .single<AccountsRow>();
  if (error || !data) {
    throw new Error(
      `accounts.clearDeletionServiceRole failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRecord(data);
}

/**
 * MOBILE-COMPANION-M1 — sessionless account fetch for the bearer-authed mobile
 * namespace (no cookie session ⇒ RLS cannot scope reads). NON-AUTHORIZING: the
 * caller (the mobile gate / session service) supplies ids it has ALREADY tied
 * to the verified user via membership rows; the explicit `id IN` predicate is
 * the scope. Same columns/mapper as the session reads — nothing extra leaves.
 */
export async function listByIdsServiceRole(
  accountIds: readonly string[],
): Promise<readonly AccountRecord[]> {
  if (accountIds.length === 0) return [];
  const supabase = getServiceRoleClient(
    `accounts: listByIdsServiceRole (${accountIds.length} ids, mobile v1)`,
  );
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .in("id", accountIds as string[]);
  if (error) {
    throw new Error(`accounts.listByIdsServiceRole failed: ${error.message}`);
  }
  return ((data ?? []) as AccountsRow[]).map(rowToRecord);
}
