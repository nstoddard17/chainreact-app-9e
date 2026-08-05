import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type {
  AccountMembershipRecord,
  MembershipRole,
} from "@/contracts/accounts";
import { MembershipRoleSchema } from "@/contracts/accounts";
import type { RpcArgs, RpcRows } from "@/types/rpc";
import { asTypedDb } from "./supabase/typedDb";
import type { TableRow } from "@/types/tables";

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

// SUPABASE-TABLE-TYPING-1A — generated row; `role` is a CHECK-constrained text
// column the generator widens to `string`, narrowed here with the contract
// schema so an unknown role cannot become an authorization decision.
function rowToRecord(row: TableRow<"account_memberships">): AccountMembershipRecord {
  return {
    accountId: row.account_id,
    userId: row.user_id,
    role: MembershipRoleSchema.parse(row.role),
    invitedByUserId: row.invited_by_user_id,
    joinedAt: row.joined_at,
  };
}

/**
 * Service-role: insert the OWNER membership for a freshly-created team/org
 * account (4.ACCOUNT-MODEL-13). The creator becomes `owner`. Mirrors the owner
 * membership the signup trigger writes for personal accounts; the personal-
 * invariants trigger is a no-op for non-personal accounts, so this is the team
 * path. No client write path exists for memberships.
 */
export async function insertOwnerMembershipServiceRole(
  accountId: string,
  userId: string,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_memberships: insertOwner for account ${accountId}`,
  );
  const db = asTypedDb(supabase);
  const { error } = await db
    .from("account_memberships")
    .insert({ account_id: accountId, user_id: userId, role: "owner" });
  if (error) {
    throw new Error(
      `account_memberships.insertOwnerMembershipServiceRole failed: ${error.message}`,
    );
  }
}

/**
 * Service-role: add a member to a team/org account with a non-owner role
 * (4.ACCOUNT-MODEL-15 invite acceptance). The personal-invariants trigger is a
 * no-op for non-personal accounts, so admin/member rows are accepted. Owner is
 * never inserted this way (owner arrives via creation / future transfer).
 */
export async function insertMembershipServiceRole(
  accountId: string,
  userId: string,
  role: Exclude<MembershipRole, "owner">,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_memberships: insertMember (${role}) for account ${accountId}`,
  );
  const db = asTypedDb(supabase);
  const { error } = await db
    .from("account_memberships")
    .insert({ account_id: accountId, user_id: userId, role });
  if (error) {
    throw new Error(
      `account_memberships.insertMembershipServiceRole failed: ${error.message}`,
    );
  }
}

export async function listByAccount(
  accountId: string,
): Promise<readonly AccountMembershipRecord[]> {
  const supabase = await createClient();
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("account_memberships")
    .select("*")
    .eq("account_id", accountId);
  if (error) {
    throw new Error(`account_memberships.listByAccount failed: ${error.message}`);
  }
  return (data ?? []).map(rowToRecord);
}

/**
 * Safe display identity for every member of an account (4.TEAM-PAGE-2).
 *
 * Reads through the `get_account_member_identities` SECURITY DEFINER RPC, which
 * joins `auth.users` (email — not PostgREST-exposed) + `user_profiles`
 * (display_name — RLS owner-only) AFTER verifying the caller is a member of the
 * account. Session-client ONLY: the RPC keys its co-member gate off `auth.uid()`,
 * so it must run in the caller's request context (never service-role). A
 * non-member caller gets a 42501 error surfaced as a thrown Error here — emails
 * never leak outside an account.
 */
export interface AccountMemberIdentity {
  userId: string;
  email: string | null;
  displayName: string | null;
}

export async function listMemberIdentities(
  accountId: string,
): Promise<readonly AccountMemberIdentity[]> {
  const supabase = await createClient();
  const db = asTypedDb(supabase);
  const { data, error } = await supabase.rpc("get_account_member_identities", {
    p_account_id: accountId,
  } satisfies RpcArgs<"get_account_member_identities">);
  if (error) {
    throw new Error(
      `account_memberships.listMemberIdentities failed: ${error.message}`,
    );
  }
  const rows: RpcRows<"get_account_member_identities"> = data ?? [];
  // RpcRows models the columns as nullable because PostgreSQL does not
  // declare nullability for function output columns. A row with no user_id is
  // not an identity, so it is dropped rather than asserted away.
  return rows.flatMap((r) =>
    r.user_id === null
      ? []
      : [{ userId: r.user_id, email: r.email, displayName: r.display_name }],
  );
}

export async function listByUser(
  userId: string,
): Promise<readonly AccountMembershipRecord[]> {
  const supabase = await createClient();
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("account_memberships")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`account_memberships.listByUser failed: ${error.message}`);
  }
  return (data ?? []).map(rowToRecord);
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
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("account_memberships")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`account_memberships.isMember failed: ${error.message}`);
  }
  return data !== null;
}

/**
 * Service-role count of an account's members (4.ACCOUNT-MODEL-20). Cheap
 * head/exact count for the Team member-limit guard — owner included.
 */
export async function countMembersServiceRole(accountId: string): Promise<number> {
  const supabase = getServiceRoleClient(
    `account_memberships: countMembers for account ${accountId}`,
  );
  const db = asTypedDb(supabase);
  const { count, error } = await db
    .from("account_memberships")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId);
  if (error) {
    throw new Error(`account_memberships.countMembersServiceRole failed: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Service-role membership existence check for an ARBITRARY user (not the caller)
 * — bypasses RLS. The invite flow (4.ACCOUNT-MODEL-15) uses this to test whether
 * a prospective invitee is already a member; the session-client `isMember` only
 * sees the caller's own rows and cannot answer that.
 */
export async function isMemberServiceRole(
  accountId: string,
  userId: string,
): Promise<boolean> {
  const supabase = getServiceRoleClient(
    `account_memberships: isMemberServiceRole for account ${accountId}`,
  );
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("account_memberships")
    .select("account_id")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`account_memberships.isMemberServiceRole failed: ${error.message}`);
  }
  return data !== null;
}

/**
 * Service-role: the role of an ARBITRARY user on an account (or null) — bypasses
 * RLS. Membership management (4.ACCOUNT-MODEL-16) needs the TARGET member's role
 * (not the caller's) to enforce the owner-target / admin-manages-members guard.
 */
export async function getRoleServiceRole(
  accountId: string,
  userId: string,
): Promise<MembershipRole | null> {
  const supabase = getServiceRoleClient(
    `account_memberships: getRoleServiceRole for account ${accountId}`,
  );
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("account_memberships")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`account_memberships.getRoleServiceRole failed: ${error.message}`);
  }
  if (!data || data.role === null) return null;
  return MembershipRoleSchema.parse(data.role);
}

/**
 * Service-role: remove a membership row (4.ACCOUNT-MODEL-16). The service guards
 * against removing an owner; this is the raw delete.
 */
export async function removeMembershipServiceRole(
  accountId: string,
  userId: string,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_memberships: removeMembership for account ${accountId}`,
  );
  const db = asTypedDb(supabase);
  const { error } = await db
    .from("account_memberships")
    .delete()
    .eq("account_id", accountId)
    .eq("user_id", userId);
  if (error) {
    throw new Error(`account_memberships.removeMembershipServiceRole failed: ${error.message}`);
  }
}

/**
 * Service-role: change a member's role (4.ACCOUNT-MODEL-16). Only admin↔member;
 * the service refuses owner targets / owner promotions (owner is transfer, D5).
 */
export async function updateMemberRoleServiceRole(
  accountId: string,
  userId: string,
  role: Exclude<MembershipRole, "owner">,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `account_memberships: updateMemberRole (${role}) for account ${accountId}`,
  );
  const db = asTypedDb(supabase);
  const { error } = await db
    .from("account_memberships")
    .update({ role })
    .eq("account_id", accountId)
    .eq("user_id", userId);
  if (error) {
    throw new Error(`account_memberships.updateMemberRoleServiceRole failed: ${error.message}`);
  }
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
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("account_memberships")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`account_memberships.getRole failed: ${error.message}`);
  }
  if (!data || data.role === null) return null;
  return MembershipRoleSchema.parse(data.role);
}

/**
 * MOBILE-COMPANION-M1 — sessionless membership list for the bearer-authed
 * mobile namespace. NON-AUTHORIZING on its own: `userId` MUST be the verified
 * bearer identity (the mobile gate's contract) — the explicit predicate is the
 * scope, mirroring the session `listByUser` exactly.
 */
export async function listByUserServiceRole(
  userId: string,
): Promise<readonly AccountMembershipRecord[]> {
  const supabase = getServiceRoleClient(
    `account_memberships: listByUserServiceRole (mobile v1)`,
  );
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("account_memberships")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    throw new Error(
      `account_memberships.listByUserServiceRole failed: ${error.message}`,
    );
  }
  return (data ?? []).map(rowToRecord);
}
