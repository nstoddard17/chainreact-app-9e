import type { MembershipRole } from "@/contracts/accounts";
import * as workflowsRepo from "@/repositories/workflows";
import { listByWorkflowServiceRole } from "@/repositories/workflowNodeCredentials";
import { listActiveConnectedUserIdsServiceRole } from "@/repositories/integrations";
import { listMembers } from "@/services/accounts/membership";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";
import { isNodeCredentialReassignmentEnabled } from "./flags";

/**
 * Builder-side credential-owner metadata + eligible reassignment targets
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-5B / CS-4b).
 *
 * Safe, display-only views over `workflow_node_credentials` for the builder:
 *   - per-node LIVE (pending|accepted) override state + the owner's DISPLAY NAME,
 *   - the members eligible to take over a node (already connected to its provider).
 *
 * No-leak invariants (mirrors the options no-leak policy):
 *   - NEVER returns an OAuth token, provider account label, email, or scope.
 *   - Owner identity is a DISPLAY NAME only (null → the UI shows generic copy).
 *   - Eligible-targets reveals connection status, so it is owner/admin/creator-
 *     gated (`forbidden` otherwise) — a plain member cannot enumerate who
 *     connected what.
 *   - The route authorizes account membership first; a non-member never reaches
 *     here (collapses to 404 upstream).
 */

export type NodeCredentialOwnerStatus = "pending" | "accepted";

export interface NodeCredentialOwnerRecord {
  readonly nodeId: string;
  readonly provider: string;
  readonly status: NodeCredentialOwnerStatus;
  /**
   * Display name only — accepted: the assigned owner; pending: the requested
   * target. Null when the name is unknown (UI falls back to generic copy). Never
   * an email / credential label.
   */
  readonly ownerDisplayName: string | null;
}

export interface CredentialOwnerMetadata {
  readonly workflowId: string;
  /** Owner/admin or the workflow creator — may request/revoke reassignments. */
  readonly canManage: boolean;
  readonly nodes: readonly NodeCredentialOwnerRecord[];
}

export type MetadataResult =
  | { ok: true; metadata: CredentialOwnerMetadata }
  | { ok: false; reason: "workflow_not_found" };

function computeCanManage(
  callerUserId: string,
  callerRole: MembershipRole,
  createdByUserId: string,
): boolean {
  return callerRole === "owner" || callerRole === "admin" || callerUserId === createdByUserId;
}

/**
 * Per-node LIVE override state + display names for a workflow. Flag OFF → safe
 * empty state (`canManage:false`, no nodes) so the UI hides reassign controls.
 */
export async function buildNodeCredentialOwnerMetadata(input: {
  workflowId: string;
  callerUserId: string;
  callerRole: MembershipRole;
}): Promise<MetadataResult> {
  const wf = await workflowsRepo.getByIdServiceRole(input.workflowId);
  if (!wf || wf.state === "deleted") return { ok: false, reason: "workflow_not_found" };

  if (!isNodeCredentialReassignmentEnabled()) {
    return { ok: true, metadata: { workflowId: wf.id, canManage: false, nodes: [] } };
  }

  const canManage = computeCanManage(input.callerUserId, input.callerRole, wf.createdByUserId);

  const grants = await listByWorkflowServiceRole(input.workflowId);
  const live = grants.filter((g) => g.status === "pending" || g.status === "accepted");
  if (live.length === 0) {
    return { ok: true, metadata: { workflowId: wf.id, canManage, nodes: [] } };
  }

  // Resolve owner ids → DISPLAY NAMES only (membership identity RPC; never email).
  const members = await listMembers(wf.accountId);
  const nameByUser = new Map(members.map((m) => [m.userId, m.displayName]));

  const nodes: NodeCredentialOwnerRecord[] = live.map((g) => ({
    nodeId: g.nodeId,
    provider: g.provider,
    status: g.status as NodeCredentialOwnerStatus,
    ownerDisplayName: nameByUser.get(g.credentialOwnerUserId) ?? null,
  }));

  return { ok: true, metadata: { workflowId: wf.id, canManage, nodes } };
}

export interface EligibleTarget {
  readonly userId: string;
  readonly displayName: string | null;
  readonly role: MembershipRole;
}

export type EligibleTargetsResult =
  | { ok: true; members: readonly EligibleTarget[] }
  | {
      ok: false;
      reason: "feature_disabled" | "workflow_not_found" | "node_not_found" | "not_applicable" | "forbidden";
    };

/**
 * Members eligible to take over a node's personal-provider credential: account
 * members who ALREADY have an active connection for that provider, minus the
 * current effective owner (assigning them would be a no-op). Owner/admin/creator
 * only — reveals connection status. Returns display name + role + id only.
 */
export async function listEligibleReassignmentTargets(input: {
  workflowId: string;
  nodeId: string;
  callerUserId: string;
  callerRole: MembershipRole;
}): Promise<EligibleTargetsResult> {
  if (!isNodeCredentialReassignmentEnabled()) return { ok: false, reason: "feature_disabled" };

  const wf = await workflowsRepo.getByIdServiceRole(input.workflowId);
  if (!wf || wf.state === "deleted") return { ok: false, reason: "workflow_not_found" };

  if (!computeCanManage(input.callerUserId, input.callerRole, wf.createdByUserId)) {
    return { ok: false, reason: "forbidden" };
  }

  const node = wf.draftDefinition.nodes.find((n) => n.id === input.nodeId);
  if (!node) return { ok: false, reason: "node_not_found" };
  if (!node.provider || !isPersonalCredentialProvider(node.provider)) {
    return { ok: false, reason: "not_applicable" };
  }

  // The current effective owner (accepted override, else the creator) is excluded.
  const grants = await listByWorkflowServiceRole(input.workflowId);
  const liveForNode = grants.find(
    (g) => g.nodeId === input.nodeId && (g.status === "pending" || g.status === "accepted"),
  );
  const currentOwner =
    liveForNode && liveForNode.status === "accepted"
      ? liveForNode.credentialOwnerUserId
      : wf.createdByUserId;

  const [members, connectedIds] = await Promise.all([
    listMembers(wf.accountId),
    listActiveConnectedUserIdsServiceRole(wf.accountId, node.provider),
  ]);

  const eligible: EligibleTarget[] = members
    .filter((m) => connectedIds.has(m.userId) && m.userId !== currentOwner)
    .map((m) => ({ userId: m.userId, displayName: m.displayName, role: m.role }));

  return { ok: true, members: eligible };
}
