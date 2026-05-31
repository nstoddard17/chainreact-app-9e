import type { MembershipRole } from "@/contracts/accounts";
import { getRole } from "@/repositories/accountMemberships";

/**
 * Account authorization helper (4.ACCOUNT-MODEL-15).
 *
 * The single permission chokepoint for account-scoped management routes
 * (invitations now; member management in D2b). Resolves the CALLER's role on the
 * target account via `account_memberships.getRole` (session client, RLS-self —
 * a user can only read their own membership row) and checks it against the
 * `allowed` set.
 *
 * Launch RBAC is membership-role-based and gates MEMBER MANAGEMENT only — it does
 * not change workflow/integration access (any member has that). Account remains
 * the single ownership root; there are no per-resource ACLs.
 */

export type AccountRoleResult =
  | { ok: true; role: MembershipRole }
  | { ok: false; reason: "not_member" | "forbidden" };

export async function requireAccountRole(
  userId: string,
  accountId: string,
  allowed: readonly MembershipRole[],
): Promise<AccountRoleResult> {
  const role = await getRole(accountId, userId);
  if (role === null) return { ok: false, reason: "not_member" };
  if (!allowed.includes(role)) return { ok: false, reason: "forbidden" };
  return { ok: true, role };
}
