import * as accountsRepo from "@/repositories/accounts";
import * as membershipsRepo from "@/repositories/accountMemberships";
import type { AccountRecord } from "@/contracts/accounts";

/**
 * Owner-transfer service (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-3 / TL-2).
 *
 * Hands ownership of a team/org account from its current owner to an existing
 * member, by delegating the atomic swap to the TL-1 `transfer_account_ownership`
 * SECURITY DEFINER RPC (via `transferAccountOwnershipServiceRole`). The DB
 * triggers from TL-1 are the hard backstop; this service validates up front so
 * the route can return specific, typed errors instead of parsing RPC messages.
 *
 * Behavior (per the plan, docs/slices/phase-4/account-owner-transfer-leave-plan.md):
 *   - target becomes `owner`, old owner becomes `admin`,
 *   - `accounts.owner_user_id` moves to the target,
 *   - NO credentials are disconnected (that only happens on the future
 *     "transfer and leave" path — TL-3), and workflow `created_by_user_id` is
 *     never touched.
 *
 * The caller-is-owner check here is defense in depth; the route also gates with
 * `requireAccountRole(['owner'])`. Step-up re-auth is the route's responsibility.
 *
 * ── Recipient eligibility (ACCOUNT-BILLING-LIFECYCLE-3) ─────────────────────────────────
 * This is the ONLY path in the codebase that makes ANOTHER user an owner. (Team creation
 * makes the *creator* the owner; invitations reject `owner` outright
 * (`owner_not_invitable`); the member role-change path is admin↔member only and refuses an
 * owner target. There is no admin reassignment path.) So recipient eligibility is enforced
 * here, at the service, and the route merely projects the typed reason.
 *
 * A team/Business account must not be handed to a user who cannot be its responsible owner:
 * one whose personal account is `pending_deletion` (frozen, heading for purge) or whose
 * identity no longer exists. Handing a team to such a user would leave it owned by an
 * account that is about to be destroyed — and the purge's own
 * `accounts.owner_user_id → auth.users ON DELETE RESTRICT` would then jam.
 *
 * BILLING TIER IS NOT ELIGIBILITY. A recipient on Free, or one whose personal subscription
 * is scheduled to cancel, is perfectly eligible — they are an active user. Only the
 * lifecycle state of their personal ACCOUNT matters. The predicate reuses the existing
 * `accounts.deletion_status` field; no new status column is introduced.
 */
export type TransferOwnershipReason =
  | "account_not_found"
  | "personal_account"
  | "account_frozen"
  | "not_owner"
  | "target_not_member"
  | "target_is_owner"
  /**
   * The recipient's own ChainReact account is unavailable — pending deletion, frozen, or
   * gone. Deliberately ONE reason for every such state: the initiating owner needs to know
   * to pick somebody else, and does not need to be told the private details of another
   * user's account lifecycle.
   */
  | "target_unavailable"
  | "transfer_failed";

export interface TransferOwnershipSuccess {
  ok: true;
  /** The account after the swap (owner_user_id now the target). */
  account: AccountRecord;
  previousOwnerUserId: string;
  newOwnerUserId: string;
}

export type TransferOwnershipResult =
  | TransferOwnershipSuccess
  | { ok: false; reason: TransferOwnershipReason };

/**
 * Can this user be handed ownership of a team/Business account?
 *
 * Eligible = they have a personal account and it is `active`. Ineligible = `pending_deletion`
 * (frozen / heading for purge) or no personal account at all (identity purged or never
 * provisioned) — the latter fails CLOSED: a missing row is never read as "fine".
 *
 * A read failure propagates rather than defaulting either way; the caller turns any throw
 * into `transfer_failed`, so an unreachable DB can never be mistaken for eligibility.
 */
async function isEligibleToReceiveOwnership(userId: string): Promise<boolean> {
  const personal = await accountsRepo.getPersonalAccountForUserServiceRole(userId);
  if (!personal) return false;
  return personal.deletionStatus === "active";
}

/**
 * Undo a swap that raced with the recipient entering deletion. The original owner was
 * demoted to `admin` by the RPC and is still a member, so the reverse transfer is a valid
 * call. Best-effort by nature — if it fails we are in the state the guard exists to prevent,
 * so it is logged at ERROR for an operator, and the purge's RESTRICT FK still fails closed
 * rather than destroying the recipient.
 */
async function revertSwap(input: {
  accountId: string;
  originalOwnerUserId: string;
  recipientUserId: string;
}): Promise<boolean> {
  try {
    await accountsRepo.transferAccountOwnershipServiceRole({
      accountId: input.accountId,
      currentOwnerUserId: input.recipientUserId,
      targetUserId: input.originalOwnerUserId,
    });
    return true;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "account.owner.transfer_revert_failed",
        accountId: input.accountId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return false;
  }
}

export async function transferOwnership(input: {
  accountId: string;
  /** The authenticated caller — must be the current owner. */
  callerUserId: string;
  targetUserId: string;
}): Promise<TransferOwnershipResult> {
  const account = await accountsRepo.getByIdServiceRole(input.accountId);
  if (!account) return { ok: false, reason: "account_not_found" };

  // Personal accounts have no other members to transfer to; deletion is the
  // path for them, not transfer.
  if (account.type === "personal") return { ok: false, reason: "personal_account" };

  // A frozen / pending-deletion account is read-only for lifecycle ops.
  if (account.deletionStatus !== "active") {
    return { ok: false, reason: "account_frozen" };
  }

  // Only the current owner can transfer (route also gates owner-role).
  if (account.ownerUserId !== input.callerUserId) {
    return { ok: false, reason: "not_owner" };
  }

  if (input.targetUserId === input.callerUserId) {
    return { ok: false, reason: "target_is_owner" };
  }

  const targetRole = await membershipsRepo.getRoleServiceRole(
    input.accountId,
    input.targetUserId,
  );
  if (targetRole === null) return { ok: false, reason: "target_not_member" };

  // RECIPIENT ELIGIBILITY — before the swap, before any role change, before any audit
  // event, before any notification. A rejection here mutates nothing at all.
  let targetEligible: boolean;
  try {
    targetEligible = await isEligibleToReceiveOwnership(input.targetUserId);
  } catch (err) {
    // Could not determine eligibility → refuse. Never proceed on an unknown answer.
    console.error(
      JSON.stringify({
        event: "account.owner.transfer_eligibility_unreadable",
        accountId: input.accountId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, reason: "transfer_failed" };
  }
  if (!targetEligible) {
    console.info(
      JSON.stringify({
        event: "account.owner.transfer_rejected_target_unavailable",
        accountId: input.accountId,
        // The recipient's lifecycle state is NOT logged — only that it disqualified them.
      }),
    );
    return { ok: false, reason: "target_unavailable" };
  }

  try {
    await accountsRepo.transferAccountOwnershipServiceRole({
      accountId: input.accountId,
      currentOwnerUserId: input.callerUserId,
      targetUserId: input.targetUserId,
    });
  } catch (err) {
    // The up-front checks already covered the expected refusals; a throw here is
    // an unexpected DB-level failure (e.g. a race that the TL-1 triggers caught).
    console.error(
      JSON.stringify({
        event: "account.owner.transfer_failed",
        accountId: input.accountId,
        from: input.callerUserId,
        to: input.targetUserId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, reason: "transfer_failed" };
  }

  // RACE RE-VERIFICATION (ACCOUNT-BILLING-LIFECYCLE-3).
  //
  // The eligibility read and the swap are two statements, so a recipient can begin deletion
  // in the window between them. The two interleavings:
  //
  //   (a) transfer commits FIRST, then the recipient requests deletion → their deletion's
  //       sole-owner guard re-reads owned accounts, now sees this one, and BLOCKS. Safe with
  //       no extra work — the deletion side already re-checks at write time.
  //
  //   (b) the recipient's deletion commits BETWEEN our check and our swap → we would leave
  //       the account owned by a pending-deletion user. That is the case this block closes:
  //       re-read the recipient AFTER the swap and, if they are no longer eligible, undo it.
  //
  // This is a compensating action rather than a single transaction because the swap lives in
  // the TL-1 `transfer_account_ownership` RPC and the deletion write is a separate statement
  // in another service; making them one transaction means pushing the predicate into SQL
  // (a migration + matching FOR UPDATE lock on the recipient's personal account row on BOTH
  // paths). That is the durable fix and is recorded as the follow-up. Until then the residual
  // window is closed by re-verification, and the worst unhandled outcome is fail-CLOSED: the
  // purge cannot delete a user who still owns an account (owner_user_id RESTRICT).
  // A read failure here must NOT be treated as "still eligible" — fail closed and revert,
  // exactly as if the recipient had become ineligible.
  const stillEligible = await isEligibleToReceiveOwnership(input.targetUserId).catch(
    () => false,
  );
  if (!stillEligible) {
    const reverted = await revertSwap({
      accountId: input.accountId,
      originalOwnerUserId: input.callerUserId,
      recipientUserId: input.targetUserId,
    });
    console.info(
      JSON.stringify({
        event: "account.owner.transfer_raced_target_deletion",
        accountId: input.accountId,
        reverted,
      }),
    );
    return { ok: false, reason: "target_unavailable" };
  }

  const updated = await accountsRepo.getByIdServiceRole(input.accountId);

  console.info(
    JSON.stringify({
      event: "account.owner.transferred",
      accountId: input.accountId,
      from: input.callerUserId,
      to: input.targetUserId,
    }),
  );

  return {
    ok: true,
    account: updated ?? { ...account, ownerUserId: input.targetUserId },
    previousOwnerUserId: input.callerUserId,
    newOwnerUserId: input.targetUserId,
  };
}
