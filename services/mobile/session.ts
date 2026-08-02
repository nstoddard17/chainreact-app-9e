import {
  MobileSessionSchema,
  type MobileSession,
} from "@chainreact/mobile-contracts";
import { listByUserServiceRole } from "@/repositories/accountMemberships";
import { listByIdsServiceRole } from "@/repositories/accounts";
import { getActiveAccountIdServiceRole } from "@/repositories/userProfiles";

/**
 * Mobile session read model (MOBILE-COMPANION-M1-MOBILE-READ-API-1).
 *
 * Sessionless composition (bearer identity, no cookie ⇒ no RLS scoping):
 * memberships fetched by the VERIFIED user id, accounts fetched by those
 * membership ids only — the same rows the cookie path's RLS would yield.
 *
 * READ-ONLY: the stored web active-account pointer is only a SUGGESTION for
 * `defaultAccountId` (honored when it names a listed, unfrozen account, else
 * the personal account) — never written, never self-healed. Capability
 * booleans are the SERVER's authorization projection (owner/admin manage
 * accounts — the `requireAccountRole(["owner","admin"])` rule), so the phone
 * renders capabilities without re-deriving roles.
 */
export async function buildMobileSession(user: {
  userId: string;
  email: string | null;
}): Promise<MobileSession> {
  const memberships = await listByUserServiceRole(user.userId);
  const accounts = await listByIdsServiceRole(memberships.map((m) => m.accountId));
  const storedActive = await getActiveAccountIdServiceRole(user.userId);

  const roleByAccount = new Map(memberships.map((m) => [m.accountId, m.role]));
  const summaries = accounts.map((a) => {
    const role = roleByAccount.get(a.id) ?? "member";
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      role,
      isFrozen: a.deletionStatus !== "active",
      capabilities: { canManageAccount: role === "owner" || role === "admin" },
    };
  });
  // Personal first, then by name — the switcher order users already know.
  summaries.sort((a, b) => {
    if (a.type === "personal" && b.type !== "personal") return -1;
    if (b.type === "personal" && a.type !== "personal") return 1;
    return a.name.localeCompare(b.name);
  });

  const storedIsUsable =
    storedActive !== null &&
    summaries.some((s) => s.id === storedActive && !s.isFrozen);
  const personal = summaries.find((s) => s.type === "personal" && !s.isFrozen);
  const defaultAccountId = storedIsUsable
    ? storedActive
    : (personal?.id ?? summaries.find((s) => !s.isFrozen)?.id ?? null);

  return MobileSessionSchema.parse({
    userId: user.userId,
    email: user.email,
    accounts: summaries,
    defaultAccountId,
  });
}
