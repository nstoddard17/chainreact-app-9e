import type { AccountRecord } from "@/contracts/accounts";
import * as accountsRepo from "@/repositories/accounts";
import * as membershipsRepo from "@/repositories/accountMemberships";
import * as userProfilesRepo from "@/repositories/userProfiles";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";

/**
 * Active-account resolver (4.ACCOUNT-MODEL-11b).
 *
 * The single place an INTERACTIVE request decides which account it is scoped to,
 * per docs/slices/phase-4/account-switcher-plan.md. Precedence, highest first:
 *
 *   1. Explicit account id in the request — membership-verified. A named account
 *      the caller is NOT a member of is an ERROR (not_member), never a cue to
 *      silently serve a different account. A named account that is frozen
 *      (pending_deletion) returns account_frozen. Explicit NEVER downgrades to
 *      the personal fallback.
 *   2. Stored `active_account_id` (the durable default) — membership-verified and
 *      must be `active`. A stale / non-member / frozen / vanished NON-personal
 *      stored pointer self-heals (clears to NULL) and falls through to (3).
 *   3. Personal-account fallback — `ensurePersonalAccount` always resolves.
 *
 * `active_account_id` is a DEFAULT, not authority: membership is verified even
 * when the id came from the stored pointer, so a forged/stale pointer can never
 * leak another account.
 *
 * Freeze handling preserves today's behavior exactly: when the resolved floor is
 * the user's personal account and it is frozen, the resolver returns
 * account_frozen (the same outcome `requireUserWithAccount` produces today). A
 * stored pointer AT the personal account is left untouched (not cleared) so that
 * personal-account freeze behavior is identical to pre-11b.
 *
 * NOT for background work. Cron / polling / webhook / scheduled paths resolve the
 * account from the workflow/integration they fire for — they must never call this.
 * NOT wired into any route in 11b (that is 11c).
 */

export type ResolveSource = "explicit" | "active" | "personal";
export type ResolveFailureReason = "not_member" | "account_frozen";

export interface ResolvedAccount {
  ok: true;
  source: ResolveSource;
  accountId: string;
  account: AccountRecord;
}
export interface ResolveFailure {
  ok: false;
  reason: ResolveFailureReason;
  /** The offending account id (the explicit/personal account that failed). */
  accountId: string;
}
export type ResolveResult = ResolvedAccount | ResolveFailure;

export interface ResolveActiveAccountOptions {
  /** An account id named explicitly by the request (path/query/body). */
  explicitAccountId?: string | null;
}

export interface SetActiveAccountSuccess {
  ok: true;
  account: AccountRecord;
}
export interface SetActiveAccountFailure {
  ok: false;
  reason: ResolveFailureReason;
  accountId: string;
}
export type SetActiveAccountResult =
  | SetActiveAccountSuccess
  | SetActiveAccountFailure;

function ok(source: ResolveSource, account: AccountRecord): ResolvedAccount {
  return { ok: true, source, accountId: account.id, account };
}
function fail(reason: ResolveFailureReason, accountId: string): ResolveFailure {
  return { ok: false, reason, accountId };
}

/**
 * Membership + freeze gate for a single explicitly-named account. Shared by the
 * resolver's explicit branch and `setActiveAccount` so a "set" and a later
 * "resolve" of the same id always agree. `active_account_id` is a default, not
 * authority — this is where the authority (membership) is actually checked.
 */
async function verifyMemberAccount(
  userId: string,
  accountId: string,
): Promise<
  | { ok: true; account: AccountRecord }
  | { ok: false; reason: ResolveFailureReason }
> {
  const member = await membershipsRepo.isMember(userId, accountId);
  if (!member) return { ok: false, reason: "not_member" };
  const account = await accountsRepo.getById(accountId);
  // Member row but no readable account → not resolvable; treat as not_member.
  if (!account) return { ok: false, reason: "not_member" };
  if (account.deletionStatus !== "active") {
    return { ok: false, reason: "account_frozen" };
  }
  return { ok: true, account };
}

export async function resolveActiveAccount(
  userId: string,
  options: ResolveActiveAccountOptions = {},
): Promise<ResolveResult> {
  const explicitAccountId = options.explicitAccountId ?? null;

  // 1. Explicit account id — membership-verified, never downgrades.
  if (explicitAccountId !== null) {
    const verified = await verifyMemberAccount(userId, explicitAccountId);
    if (!verified.ok) return fail(verified.reason, explicitAccountId);
    return ok("explicit", verified.account);
  }

  // Resolve the personal floor once — needed both as the fallback and to know
  // whether a stored pointer is AT the personal account (which is preserved).
  const personal = await ensurePersonalAccount(userId);

  // 2. Stored active pointer — only when it differs from the personal floor.
  // A pointer AT the personal account is deliberately NOT cleared: personal-
  // account freeze behavior must be identical to today.
  const stored = await userProfilesRepo.getActiveAccountId(userId);
  if (stored !== null && stored !== personal.id) {
    const verified = await verifyMemberAccount(userId, stored);
    if (verified.ok) return ok("active", verified.account);
    // Stale / non-member / frozen / vanished non-personal stored pointer →
    // self-heal to the personal fallback. Best-effort; never blocks resolution.
    await clearStoredActive(userId);
  }

  // 3. Personal-account floor. If the floor itself is frozen, surface
  // account_frozen — the exact outcome requireUserWithAccount produces today.
  if (personal.deletionStatus !== "active") {
    return fail("account_frozen", personal.id);
  }
  return ok("personal", personal);
}

/**
 * Set the caller's durable active-account pointer (4.ACCOUNT-MODEL-11d).
 *
 * The write happens ONLY after the same membership + freeze gate the resolver
 * uses passes, so the stored pointer can never name an account the caller may
 * not operate on. Setting it grants NO access — it is a UI default; authority is
 * always re-checked at resolve time. `userId` is the authenticated caller (never
 * taken from request input), so a user can only set their OWN active account.
 *
 * Failure does NOT touch `active_account_id` — the previous value is preserved.
 *
 *   - not_member    → caller is not a member of the target account.
 *   - account_frozen → target is pending_deletion (non-operational).
 *
 * Not for background work — interactive (switcher) use only.
 */
export async function setActiveAccount(
  userId: string,
  accountId: string,
): Promise<SetActiveAccountResult> {
  const verified = await verifyMemberAccount(userId, accountId);
  if (!verified.ok) return { ok: false, reason: verified.reason, accountId };
  await userProfilesRepo.setActiveAccountId(userId, accountId);
  return { ok: true, account: verified.account };
}

async function clearStoredActive(userId: string): Promise<void> {
  try {
    await userProfilesRepo.clearActiveAccountId(userId);
  } catch (err) {
    // Observability for a self-heal that failed; resolution still proceeds.
    console.warn(
      JSON.stringify({
        event: "account.active.clear_failed",
        message: (err as Error).message,
      }),
    );
  }
}
