import * as accountsRepo from "@/repositories/accounts";
import * as membershipsRepo from "@/repositories/accountMemberships";
import { softDisconnectPersonalForMember } from "@/repositories/integrations";
import { revokeLiveForMemberServiceRole } from "@/repositories/workflowNodeCredentials";
import { clearActiveAccountIfMatchesServiceRole } from "@/repositories/userProfiles";

/**
 * Leave-account service (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-4 / TL-3).
 *
 * Self-service: a member or admin leaves a team/org account. Reuses the EXACT
 * offboarding sequence `removeMember` runs (services/accounts/membership.ts) —
 * soft-disconnect the leaver's PERSONAL credentials first (idempotent,
 * retry-safe), then remove the membership, then clear their active-account
 * pointer. Account/service credentials stay connected, workflows remain
 * account-owned, and `created_by_user_id` is never changed.
 *
 * A sole owner cannot leave — they must transfer ownership first (TL-2). At
 * launch the model is single-owner, so any `owner` is the sole owner; the check
 * is therefore "owner ⇒ must transfer". (A future multi-owner model would refine
 * this to "an owner may leave iff another owner remains".) The TL-1 ≥1-owner DB
 * trigger is the hard backstop if this gate is ever bypassed.
 */
export type LeaveAccountReason =
  | "account_not_found"
  | "personal_account"
  | "account_frozen"
  | "not_member"
  | "sole_owner_must_transfer";

export type LeaveAccountResult = { ok: true } | { ok: false; reason: LeaveAccountReason };

export async function leaveAccount(input: {
  accountId: string;
  userId: string;
}): Promise<LeaveAccountResult> {
  const account = await accountsRepo.getByIdServiceRole(input.accountId);
  if (!account) return { ok: false, reason: "account_not_found" };

  // You cannot "leave" your personal account — deletion is that path.
  if (account.type === "personal") return { ok: false, reason: "personal_account" };

  // A frozen / pending-deletion account is read-only for lifecycle ops.
  if (account.deletionStatus !== "active") return { ok: false, reason: "account_frozen" };

  const role = await membershipsRepo.getRoleServiceRole(input.accountId, input.userId);
  if (role === null) return { ok: false, reason: "not_member" };
  if (role === "owner") return { ok: false, reason: "sole_owner_must_transfer" };

  // Offboarding — identical order to removeMember. First revoke any live
  // (pending|accepted) per-node credential grants this user OWNS in the account
  // (CS-6), so nodes that ran under their connection fall back to the workflow
  // creator (CS-2) with no dangling grant. Idempotent; a no-op when they own
  // none; independent of the reassignment flag.
  const revoked = await revokeLiveForMemberServiceRole({
    accountId: input.accountId,
    credentialOwnerUserId: input.userId,
  });
  if (revoked.revokedCount > 0) {
    console.info(
      JSON.stringify({
        event: "account.member.leave.node_credentials_revoked",
        accountId: input.accountId,
        count: revoked.revokedCount,
      }),
    );
  }

  // Then soft-disconnect BEFORE the membership delete so a failed disconnect is
  // retry-safe (the member is still present) and idempotent. Only PERSONAL
  // providers connected by this user in this account are disconnected;
  // account/service providers are untouched.
  const disconnect = await softDisconnectPersonalForMember({
    accountId: input.accountId,
    connectedByUserId: input.userId,
  });
  if (disconnect.disconnectedCount > 0) {
    console.info(
      JSON.stringify({
        event: "account.member.leave.personal_integrations_disconnected",
        accountId: input.accountId,
        count: disconnect.disconnectedCount,
        providers: disconnect.disconnectedProviders,
      }),
    );
  }

  await membershipsRepo.removeMembershipServiceRole(input.accountId, input.userId);
  await clearActiveAccountIfMatchesServiceRole(input.userId, input.accountId);
  return { ok: true };
}
