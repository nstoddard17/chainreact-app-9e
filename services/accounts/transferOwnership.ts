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
 */
export type TransferOwnershipReason =
  | "account_not_found"
  | "personal_account"
  | "account_frozen"
  | "not_owner"
  | "target_not_member"
  | "target_is_owner"
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
