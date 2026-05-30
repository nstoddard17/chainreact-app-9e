import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type {
  AccountRecord,
  AccountType,
} from "@/contracts/accounts";

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
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: AccountsRow): AccountRecord {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    ownerUserId: row.owner_user_id,
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
