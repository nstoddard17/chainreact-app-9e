import { createClient } from "@/utils/supabase/server";
import type {
  AccountMembershipRecord,
  MembershipRole,
} from "@/contracts/accounts";

/**
 * Repository for `account_memberships`.
 *
 * Per docs/rules/account-ownership-model.md + the Phase A slice plan at
 * docs/slices/phase-4/account-model-foundation-plan.md. Read-only at this
 * slice — every write happens via the SECURITY DEFINER signup trigger or
 * the service-role helper in `repositories/accounts.ts:ensurePersonalAccountServiceRole`.
 *
 * RLS at this slice: a user sees only their own membership rows. Phase D
 * will broaden this to "members of the same account can see each other".
 */

interface AccountMembershipsRow {
  account_id: string;
  user_id: string;
  role: MembershipRole;
  invited_by_user_id: string | null;
  joined_at: string;
}

function rowToRecord(row: AccountMembershipsRow): AccountMembershipRecord {
  return {
    accountId: row.account_id,
    userId: row.user_id,
    role: row.role,
    invitedByUserId: row.invited_by_user_id,
    joinedAt: row.joined_at,
  };
}

export async function listByAccount(
  accountId: string,
): Promise<readonly AccountMembershipRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_memberships")
    .select("*")
    .eq("account_id", accountId);
  if (error) {
    throw new Error(`account_memberships.listByAccount failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as AccountMembershipsRow));
}

export async function listByUser(
  userId: string,
): Promise<readonly AccountMembershipRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_memberships")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`account_memberships.listByUser failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as AccountMembershipsRow));
}

/**
 * True when `userId` has a membership row on `accountId`.
 *
 * Focused existence check for the active-account resolver
 * (4.ACCOUNT-MODEL-11b) — cheaper than `listByUser`. Session-client/RLS: a user
 * sees only their own membership rows, so this is meaningful only when `userId`
 * is the authenticated caller (the resolver's contract). It is one primitive of
 * the membership verification, not the authority on its own.
 */
export async function isMember(
  userId: string,
  accountId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_memberships")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle<{ account_id: string }>();
  if (error) {
    throw new Error(`account_memberships.isMember failed: ${error.message}`);
  }
  return data !== null;
}

/**
 * Returns the caller's role on `accountId`, or null when the caller has
 * no membership row on that account. Primitive for future authorization
 * wiring.
 */
export async function getRole(
  accountId: string,
  userId: string,
): Promise<MembershipRole | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle<{ role: MembershipRole }>();
  if (error) {
    throw new Error(`account_memberships.getRole failed: ${error.message}`);
  }
  return data?.role ?? null;
}
