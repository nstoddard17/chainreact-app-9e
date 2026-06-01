import type {
  AccountType,
  DeletionStatus,
  MembershipRole,
} from "@/contracts/accounts";
import { listForUser } from "@/repositories/accounts";
import { listByUser } from "@/repositories/accountMemberships";
import { getActiveAccountId } from "@/repositories/userProfiles";

/**
 * Account list service (4.ACCOUNT-MODEL-18).
 *
 * Builds the UI-ready summary the future account switcher / Teams UI consumes —
 * the caller's accounts with role, an active marker, and deletion status (the
 * last so the UI can hide/disable a frozen account). Pure composition over
 * existing repos; the co-member RLS from D2b does not affect these (both
 * `listByUser` / `listForUser` filter on the calling user).
 *
 * READ-ONLY: it computes the *effective* active account (stored pointer if it is
 * one of the caller's accounts, else the personal fallback) but NEVER self-heals
 * or writes `active_account_id`. A GET has no side effects — the 11b resolver
 * owns the self-heal at request-scoping time.
 */

export interface AccountSummary {
  id: string;
  name: string;
  type: AccountType;
  role: MembershipRole;
  isActive: boolean;
  deletionStatus: DeletionStatus;
}

export interface UserAccountsResult {
  /** Effective active account (stored-if-listed else personal); null if no accounts. */
  activeAccountId: string | null;
  accounts: AccountSummary[];
}

export async function listUserAccountSummaries(
  userId: string,
): Promise<UserAccountsResult> {
  const [memberships, accounts, storedActive] = await Promise.all([
    listByUser(userId),
    listForUser(userId),
    getActiveAccountId(userId),
  ]);

  const roleByAccount = new Map(memberships.map((m) => [m.accountId, m.role]));
  const personal = accounts.find((a) => a.type === "personal");

  // Effective active: the stored pointer only if it's one the caller actually
  // belongs to; otherwise the personal fallback (read-only — no write/self-heal).
  const activeAccountId =
    storedActive && accounts.some((a) => a.id === storedActive)
      ? storedActive
      : (personal?.id ?? null);

  const summaries: AccountSummary[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    role: roleByAccount.get(a.id) ?? "member",
    isActive: a.id === activeAccountId,
    deletionStatus: a.deletionStatus,
  }));

  // Personal first, then teams/orgs by name.
  summaries.sort((a, b) => {
    if (a.type === "personal" && b.type !== "personal") return -1;
    if (b.type === "personal" && a.type !== "personal") return 1;
    return a.name.localeCompare(b.name);
  });

  return { activeAccountId, accounts: summaries };
}
