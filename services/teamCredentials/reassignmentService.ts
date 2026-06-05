import type { MembershipRole } from "@/contracts/accounts";
import * as workflowsRepo from "@/repositories/workflows";
import * as accountsRepo from "@/repositories/accounts";
import { isMemberServiceRole } from "@/repositories/accountMemberships";
import { getActiveForExecution } from "@/repositories/integrations";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";
import {
  getForNodeServiceRole,
  createPendingRequestServiceRole,
  markAcceptedServiceRole,
  markDeclinedServiceRole,
  markRevokedServiceRole,
  DUPLICATE_LIVE_NODE_CREDENTIAL,
  type NodeCredentialStatus,
} from "@/repositories/workflowNodeCredentials";
import { isNodeCredentialReassignmentEnabled } from "./flags";

/**
 * Per-node credential reassignment service
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-4 / CS-3).
 *
 * The consent lifecycle for `workflow_node_credentials`: request → accept /
 * decline; revoke. Backend-only — NO UI, no builder/options/AI/offboarding
 * change. The route layer owns authentication + the membership/role gate
 * (`requireWorkflowAccountMember` + `requireAccountRole`) and passes the caller's
 * resolved `actingRole`; this service owns the fine-grained rules + the
 * server-side verification of the node/provider/target so a client can never
 * forge an effective grant.
 *
 * Security invariants:
 *   - Feature-flag gated (`ENABLE_NODE_CREDENTIAL_REASSIGNMENT`, default OFF).
 *   - Only an ACCEPT (by the target member) ever makes a grant effective — a
 *     caller can never create an accepted row directly (the repo only inserts
 *     `pending`; accept is a separate, target-only transition).
 *   - Account/service providers can never be node-owned (`not_applicable`).
 *   - The provider + node are re-verified from the workflow definition / grant
 *     row server-side; client-supplied identity is never trusted.
 *   - No OAuth token, provider account label, or email is read or returned — the
 *     connection check uses a presence-only lookup and responses carry only a
 *     status string.
 *
 * Notifications to the target member are DEFERRED: a clean in-app notification
 * needs a new `notification_type` enum value (a migration), which is out of scope
 * for CS-3. The consent inbox + notification land with the UI slice (CS-4).
 */

export type ReassignmentReason =
  | "feature_disabled"
  | "workflow_not_found"
  | "node_not_found"
  | "not_applicable"
  | "forbidden"
  | "target_not_member"
  | "target_not_connected"
  | "no_op"
  | "duplicate"
  | "grant_not_found"
  | "not_target"
  | "account_frozen";

export type ReassignmentResult =
  | { ok: true; status: NodeCredentialStatus }
  | { ok: false; reason: ReassignmentReason };

function fail(reason: ReassignmentReason): ReassignmentResult {
  return { ok: false, reason };
}

/** Load a live, non-deleted workflow (service-role) or null. */
async function loadWorkflow(workflowId: string) {
  const wf = await workflowsRepo.getByIdServiceRole(workflowId);
  if (!wf || wf.state === "deleted") return null;
  return wf;
}

async function isFrozen(accountId: string): Promise<boolean> {
  const status = await accountsRepo.getDeletionStatusServiceRole(accountId);
  return status === "pending_deletion";
}

/** Presence-only: does `userId` have an active connection for `provider` in `accountId`? */
async function hasActiveConnection(
  accountId: string,
  provider: string,
  userId: string,
): Promise<boolean> {
  const row = await getActiveForExecution(accountId, provider, null, {
    connectedByUserId: userId,
  });
  return row !== null;
}

function isOwnerAdmin(role: MembershipRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Request a reassignment of a personal-provider node to `targetUserId`'s
 * connection. Owner/admin, OR the workflow creator (plan §10/§16 — creator-
 * initiate accepted), may request. Creates a PENDING grant; inert until accepted.
 */
export async function requestReassignment(input: {
  workflowId: string;
  nodeId: string;
  targetUserId: string;
  callerUserId: string;
  actingRole: MembershipRole;
}): Promise<ReassignmentResult> {
  if (!isNodeCredentialReassignmentEnabled()) return fail("feature_disabled");

  const wf = await loadWorkflow(input.workflowId);
  if (!wf) return fail("workflow_not_found");

  const node = wf.draftDefinition.nodes.find((n) => n.id === input.nodeId);
  if (!node) return fail("node_not_found");
  if (!node.provider || !isPersonalCredentialProvider(node.provider)) {
    return fail("not_applicable");
  }

  if (await isFrozen(wf.accountId)) return fail("account_frozen");

  // Authorize the requester: owner/admin always; the workflow creator may
  // request for their own workflow.
  if (!isOwnerAdmin(input.actingRole) && input.callerUserId !== wf.createdByUserId) {
    return fail("forbidden");
  }

  // At most one LIVE (pending|accepted) grant per node.
  const existing = await getForNodeServiceRole(input.workflowId, input.nodeId);
  if (existing) return fail("duplicate");

  // Assigning the creator back is a no-op (no grant → creator already runs it).
  if (input.targetUserId === wf.createdByUserId) return fail("no_op");

  if (!(await isMemberServiceRole(wf.accountId, input.targetUserId))) {
    return fail("target_not_member");
  }
  if (!(await hasActiveConnection(wf.accountId, node.provider, input.targetUserId))) {
    return fail("target_not_connected");
  }

  try {
    await createPendingRequestServiceRole({
      workflowId: input.workflowId,
      nodeId: input.nodeId,
      provider: node.provider,
      credentialOwnerUserId: input.targetUserId,
      requestedByUserId: input.callerUserId,
    });
  } catch (err) {
    // Lost a race for the partial-unique live grant.
    if (err instanceof Error && err.message === DUPLICATE_LIVE_NODE_CREDENTIAL) {
      return fail("duplicate");
    }
    throw err;
  }
  return { ok: true, status: "pending" };
}

/**
 * Accept a pending request — TARGET member only. Re-checks the target is still a
 * member and still has an active connection, then makes the grant effective
 * (CS-2 execution uses it when the flag is ON).
 */
export async function acceptReassignment(input: {
  workflowId: string;
  nodeId: string;
  callerUserId: string;
}): Promise<ReassignmentResult> {
  if (!isNodeCredentialReassignmentEnabled()) return fail("feature_disabled");

  const wf = await loadWorkflow(input.workflowId);
  if (!wf) return fail("grant_not_found");
  if (await isFrozen(wf.accountId)) return fail("account_frozen");

  const grant = await getForNodeServiceRole(input.workflowId, input.nodeId);
  if (!grant || grant.status !== "pending") return fail("grant_not_found");
  if (grant.credentialOwnerUserId !== input.callerUserId) return fail("not_target");

  if (!(await isMemberServiceRole(wf.accountId, input.callerUserId))) {
    return fail("target_not_member");
  }
  if (!(await hasActiveConnection(wf.accountId, grant.provider, input.callerUserId))) {
    return fail("target_not_connected");
  }

  await markAcceptedServiceRole(grant.id, new Date().toISOString());
  return { ok: true, status: "accepted" };
}

/**
 * Decline a pending request — TARGET member only. Execution stays creator-pinned.
 */
export async function declineReassignment(input: {
  workflowId: string;
  nodeId: string;
  callerUserId: string;
}): Promise<ReassignmentResult> {
  if (!isNodeCredentialReassignmentEnabled()) return fail("feature_disabled");

  const wf = await loadWorkflow(input.workflowId);
  if (!wf) return fail("grant_not_found");

  const grant = await getForNodeServiceRole(input.workflowId, input.nodeId);
  if (!grant || grant.status !== "pending") return fail("grant_not_found");
  if (grant.credentialOwnerUserId !== input.callerUserId) return fail("not_target");

  await markDeclinedServiceRole(grant.id, new Date().toISOString());
  return { ok: true, status: "declined" };
}

/**
 * Revoke a live (pending|accepted) grant. Allowed for owner/admin, the assigned
 * credential owner, or the workflow creator (consistent with creator-initiate).
 * After revoke, execution falls back to the workflow creator.
 */
export async function revokeReassignment(input: {
  workflowId: string;
  nodeId: string;
  callerUserId: string;
  actingRole: MembershipRole;
}): Promise<ReassignmentResult> {
  if (!isNodeCredentialReassignmentEnabled()) return fail("feature_disabled");

  const wf = await loadWorkflow(input.workflowId);
  if (!wf) return fail("grant_not_found");

  const grant = await getForNodeServiceRole(input.workflowId, input.nodeId);
  if (!grant) return fail("grant_not_found");

  const allowed =
    isOwnerAdmin(input.actingRole) ||
    input.callerUserId === grant.credentialOwnerUserId ||
    input.callerUserId === wf.createdByUserId;
  if (!allowed) return fail("forbidden");

  await markRevokedServiceRole(grant.id, new Date().toISOString());
  return { ok: true, status: "revoked" };
}
