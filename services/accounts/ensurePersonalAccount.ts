import {
  getPersonalAccountForUser,
  ensurePersonalAccountServiceRole,
} from "@/repositories/accounts";
import type { AccountRecord } from "@/contracts/accounts";

/**
 * Safety-net service helper: "give me this user's personal account,
 * creating it if missing."
 *
 * Per docs/slices/phase-4/account-model-foundation-plan.md §7. The
 * normal path is for the SECURITY DEFINER signup trigger
 * (supabase/migrations/20260530000000_accounts_and_memberships.sql) to
 * have already inserted the row at user creation. This helper exists
 * because:
 *   - Future code paths (account-switcher resolver, user/account
 *     deletion-recovery flow) should be able to make a single call
 *     without needing to know about the trigger.
 *   - It is the single entry point a hot path can call when it observes
 *     a null from `getPersonalAccountForUser` without scattering
 *     service-role boundary knowledge across the app.
 *
 * Not wired into any production code path in slice 4.ACCOUNT-MODEL-3.
 *
 * The first lookup goes through the session client (RLS-gated) and only
 * returns the account if the caller is a member. When called from a
 * background context with no session, that lookup returns null and the
 * service-role ensure runs. The service-role ensure is itself idempotent
 * — the personal-account unique index prevents double-creation under
 * concurrent invocation.
 */
export async function ensurePersonalAccount(
  userId: string,
): Promise<AccountRecord> {
  const existing = await getPersonalAccountForUser(userId);
  if (existing) return existing;
  return ensurePersonalAccountServiceRole(userId);
}
