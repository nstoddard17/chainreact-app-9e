import type { MembershipRole, AccountMembershipRecord } from "@/contracts/accounts";
import * as membershipsRepo from "@/repositories/accountMemberships";
import * as accountsRepo from "@/repositories/accounts";
import { softDisconnectPersonalForMember } from "@/repositories/integrations";
import { revokeLiveForMemberServiceRole } from "@/repositories/workflowNodeCredentials";
import { clearActiveAccountIfMatchesServiceRole } from "@/repositories/userProfiles";
import { countImpactedWorkflowsForMember } from "./offboardingImpact";

/**
 * Team membership management service (4.ACCOUNT-MODEL-16, D2b).
 *
 * List members; remove a non-owner member; change a non-owner member's role
 * (admin↔member only). Backend-only — no UI, no email, no transfer/leave, no
 * payments. The route layer owns the coarse owner/admin gate (`requireAccountRole`)
 * and passes the caller's `actingRole` here; this service owns the fine-grained
 * rules:
 *
 *   - The OWNER can never be removed or demoted (owner_target). Owner role
 *     changes are ownership transfer — deferred to D5. With owner untouchable,
 *     the ≥1-owner invariant holds without a DB trigger (deferred to D5).
 *   - An ADMIN may manage MEMBERS only (not owners, not other admins). The OWNER
 *     may manage any non-owner (admin or member).
 *   - Role changes are admin↔member only — never to/from owner.
 *   - pending_deletion accounts refuse all member-management operations.
 */

export type MemberMgmtReason =
  | "account_frozen"
  | "member_not_found"
  | "owner_target"
  | "forbidden_target"
  | "invalid_role";

/**
 * A roster row enriched with safe display identity (4.TEAM-PAGE-2). Identity
 * fields are nullable: `displayName` when the member never set one,
 * `email`/`displayName` both null if an identity row is somehow absent. The UI
 * falls back name → email → short id.
 */
export interface AccountMemberWithIdentity extends AccountMembershipRecord {
  email: string | null;
  displayName: string | null;
}

export type ListMembersResult = readonly AccountMemberWithIdentity[];

export async function listMembers(accountId: string): Promise<ListMembersResult> {
  // Both reads are session-client + co-member-gated (the route already verified
  // the caller is a member; the identity RPC re-checks `auth.uid()` membership).
  // Run in parallel and merge by userId — the roster (role/joined) comes from
  // the table, identity (email/display_name) from the SECURITY DEFINER RPC.
  const [records, identities] = await Promise.all([
    membershipsRepo.listByAccount(accountId),
    membershipsRepo.listMemberIdentities(accountId),
  ]);
  const identityByUser = new Map(identities.map((i) => [i.userId, i]));
  return records.map((r) => {
    const identity = identityByUser.get(r.userId);
    return {
      ...r,
      email: identity?.email ?? null,
      displayName: identity?.displayName ?? null,
    };
  });
}

/** Shared frozen + target-resolution + acting-role gate for remove/role-change. */
async function gateTarget(
  accountId: string,
  targetUserId: string,
  actingRole: MembershipRole,
): Promise<{ ok: true } | { ok: false; reason: MemberMgmtReason }> {
  const status = await accountsRepo.getDeletionStatusServiceRole(accountId);
  if (status === "pending_deletion") return { ok: false, reason: "account_frozen" };

  const targetRole = await membershipsRepo.getRoleServiceRole(accountId, targetUserId);
  if (targetRole === null) return { ok: false, reason: "member_not_found" };
  if (targetRole === "owner") return { ok: false, reason: "owner_target" };
  // An admin may only manage plain members — not other admins.
  if (actingRole === "admin" && targetRole === "admin") {
    return { ok: false, reason: "forbidden_target" };
  }
  return { ok: true };
}

export type RemoveMemberResult = { ok: true } | { ok: false; reason: MemberMgmtReason };

export async function removeMember(input: {
  accountId: string;
  targetUserId: string;
  actingRole: MembershipRole;
}): Promise<RemoveMemberResult> {
  const gate = await gateTarget(input.accountId, input.targetUserId, input.actingRole);
  if (!gate.ok) return gate;

  // Offboarding (CS-6): revoke any live (pending|accepted) per-node credential
  // grants this member OWNS in the account BEFORE disconnecting / removing, so
  // every node that ran under their connection deterministically falls back to
  // the workflow creator (CS-2) — no accepted grant is left dangling at a
  // removed user. Runs before the membership delete for retry-safety (the gate
  // still passes on retry); idempotent and a no-op when they own no grants.
  // Independent of the reassignment flag — pure data hygiene.
  const revoked = await revokeLiveForMemberServiceRole({
    accountId: input.accountId,
    credentialOwnerUserId: input.targetUserId,
  });
  if (revoked.revokedCount > 0) {
    console.info(
      JSON.stringify({
        event: "account.member.offboard.node_credentials_revoked",
        accountId: input.accountId,
        count: revoked.revokedCount,
      }),
    );
  }

  // Offboarding (4.ACCOUNT-MODEL-22C): soft-disconnect the PERSONAL credentials
  // this member connected in this account, BEFORE deleting the membership. Doing
  // it first keeps removeMember retry-safe — if the disconnect fails, the gate
  // still passes on retry (the member isn't removed yet) and the disconnect is
  // idempotent. Account/service providers (Slack/Notion/Stripe) stay connected;
  // the member's personal-account integrations (a different account_id) are
  // untouched. After this, even workflows the departed member created — which
  // still pin to their created_by_user_id under 22B — can no longer resolve
  // their personal credential.
  const disconnect = await softDisconnectPersonalForMember({
    accountId: input.accountId,
    connectedByUserId: input.targetUserId,
  });
  if (disconnect.disconnectedCount > 0) {
    console.info(
      JSON.stringify({
        event: "account.member.offboard.personal_integrations_disconnected",
        accountId: input.accountId,
        count: disconnect.disconnectedCount,
        providers: disconnect.disconnectedProviders,
      }),
    );
  }

  await membershipsRepo.removeMembershipServiceRole(input.accountId, input.targetUserId);
  // Proactively clear the removed member's active pointer if it named this
  // account (the 11b resolver self-heals it anyway; this avoids the stale state).
  await clearActiveAccountIfMatchesServiceRole(input.targetUserId, input.accountId);
  return { ok: true };
}

export type MemberWorkflowImpactResult =
  | { ok: true; affectedWorkflowCount: number }
  | { ok: false; reason: MemberMgmtReason };

/**
 * Advisory pre-removal impact (Slice 4.TEAM-WORKFLOWS-7 / TW-5): how many
 * workflows the target member created that use a personal-provider step (those
 * may stop running after removal soft-disconnects their personal Team
 * credentials — 22C). Applies the SAME gate as `removeMember` (frozen account,
 * owner-untouchable, admin-manages-members-only) so only a caller authorized to
 * remove the target can learn the count — an unauthorized caller gets the gate
 * failure, never the impact. Read-only; changes nothing.
 */
export async function getMemberWorkflowImpact(input: {
  accountId: string;
  targetUserId: string;
  actingRole: MembershipRole;
}): Promise<MemberWorkflowImpactResult> {
  const gate = await gateTarget(input.accountId, input.targetUserId, input.actingRole);
  if (!gate.ok) return gate;
  const affectedWorkflowCount = await countImpactedWorkflowsForMember(
    input.accountId,
    input.targetUserId,
  );
  return { ok: true, affectedWorkflowCount };
}

export type ChangeRoleResult = { ok: true } | { ok: false; reason: MemberMgmtReason };

export async function changeMemberRole(input: {
  accountId: string;
  targetUserId: string;
  newRole: MembershipRole;
  actingRole: MembershipRole;
}): Promise<ChangeRoleResult> {
  // Only admin↔member — never promote/demote to/from owner (transfer is D5).
  if (input.newRole !== "admin" && input.newRole !== "member") {
    return { ok: false, reason: "invalid_role" };
  }
  const gate = await gateTarget(input.accountId, input.targetUserId, input.actingRole);
  if (!gate.ok) return gate;

  await membershipsRepo.updateMemberRoleServiceRole(
    input.accountId,
    input.targetUserId,
    input.newRole,
  );
  return { ok: true };
}
