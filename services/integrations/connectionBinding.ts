import type { MembershipRole } from "@/contracts/accounts";
import * as workflowsRepo from "@/repositories/workflows";
import * as accountsRepo from "@/repositories/accounts";
import { isMemberServiceRole } from "@/repositories/accountMemberships";
import {
  getActiveForExecution,
  listSharedConnectorUserIdsServiceRole,
} from "@/repositories/integrations";
import {
  setForNodeServiceRole,
  deleteForNodeServiceRole,
  listByWorkflowServiceRole,
} from "@/repositories/workflowNodeConnectorBindings";
import { isPrivateCredentialProvider } from "@/core/integrations/workflowCredentialScope";
import { listMembers } from "@/services/accounts/membership";
import { isConnectionSharingEnabled } from "./connectionSharingFlags";

/**
 * Node connector binding service (Slice 4.CONN-SHARE / CS-4a).
 *
 * Backend-only chokepoint to bind a workflow node to a SPECIFIC connector whose
 * personal connection is explicitly `shared_with_account` — the §14.3 multi-sharer
 * disambiguation. The route layer authenticates + membership-gates (404 no-leak)
 * and passes the caller's resolved role; this service owns the fine-grained rules
 * and the server-side validation a client can never forge.
 *
 * BEHAVIOR-INERT: CS-4a only STORES + LISTS bindings. Nothing reads them at
 * resolve/run time yet — execution resolver, run/edit gate, CS-3a eligibility
 * live path, workflow DTO booleans, Apps/builder UI, Disconnect/Reconnect,
 * workflow_node_credentials are all untouched. CS-4b wires the precedence
 * (accepted node-credential grant → valid connector binding → single-sharer →
 * creator; ambiguous-no-binding fails closed) and the run/edit gate IN LOCKSTEP.
 *
 * Security invariants:
 *   - Flag-gated (`ENABLE_CONNECTION_SHARING`, default OFF) ⇒ `not_enabled`.
 *   - "No silent share" is STRUCTURAL: a binding can ONLY point to a connector
 *     already in the live shared set for that provider — owner/admin cannot bind
 *     to an unshared identity (`connector_not_shared`).
 *   - Account/service + native providers are never bindable (`not_applicable`).
 *   - The node + provider are re-verified from the workflow definition; the draft
 *     definition is NEVER mutated.
 *   - No OAuth token, provider account label, email, scope, or account metadata is
 *     read or returned — only display names (member identity RPC) + opaque user ids.
 */

export type ConnectorBindingReason =
  | "not_enabled"
  | "workflow_not_found"
  | "node_not_found"
  | "not_applicable"
  | "account_frozen"
  | "forbidden"
  | "connector_not_member"
  | "connector_not_connected"
  | "connector_not_shared";

export type SetBindingResult = { ok: true } | { ok: false; reason: ConnectorBindingReason };
export type ClearBindingResult =
  | { ok: true; cleared: boolean }
  | { ok: false; reason: ConnectorBindingReason };

/** Safe picker option — reuses the eligible-targets shape (no email/label/token). */
export interface SharedConnectorOption {
  readonly userId: string;
  readonly displayName: string | null;
  readonly role: MembershipRole;
}
export type EligibleConnectorsResult =
  | { ok: true; connectors: readonly SharedConnectorOption[] }
  | { ok: false; reason: ConnectorBindingReason };

/** Safe per-node binding view (display name + opaque user id; no identity detail). */
export interface NodeBindingView {
  readonly nodeId: string;
  readonly provider: string;
  readonly connectorUserId: string;
  readonly connectorDisplayName: string | null;
}
export type WorkflowBindingsResult =
  | { ok: true; bindings: readonly NodeBindingView[] }
  | { ok: false; reason: ConnectorBindingReason };

function fail<T extends { ok: false; reason: ConnectorBindingReason }>(
  reason: ConnectorBindingReason,
): T {
  return { ok: false, reason } as T;
}

async function loadWorkflow(workflowId: string) {
  const wf = await workflowsRepo.getByIdServiceRole(workflowId);
  if (!wf || wf.state === "deleted") return null;
  return wf;
}

async function isFrozen(accountId: string): Promise<boolean> {
  return (await accountsRepo.getDeletionStatusServiceRole(accountId)) === "pending_deletion";
}

function isOwnerAdmin(role: MembershipRole): boolean {
  return role === "owner" || role === "admin";
}

/** Caller may edit the workflow: owner/admin, or the workflow creator. (CS-4a does NOT widen this.) */
function mayEdit(role: MembershipRole, callerUserId: string, createdByUserId: string): boolean {
  return isOwnerAdmin(role) || callerUserId === createdByUserId;
}

/**
 * Resolve + authorize a node for a binding mutation/read. Returns the workflow +
 * the personal provider of the node, or a typed failure.
 */
async function resolveBindableNode(input: {
  workflowId: string;
  nodeId: string;
  callerUserId: string;
  callerRole: MembershipRole;
}): Promise<
  | { ok: true; accountId: string; provider: string }
  | { ok: false; reason: ConnectorBindingReason }
> {
  const wf = await loadWorkflow(input.workflowId);
  if (!wf) return { ok: false, reason: "workflow_not_found" };

  const node = wf.draftDefinition.nodes.find((n) => n.id === input.nodeId);
  if (!node) return { ok: false, reason: "node_not_found" };
  // Bindable = private-credential provider: personal AND not a native pseudo-
  // provider (isPrivateCredentialProvider excludes `native` via NON_OAUTH_PROVIDERS;
  // account/service providers are also excluded — both → not_applicable).
  if (!node.provider || !isPrivateCredentialProvider(node.provider)) {
    return { ok: false, reason: "not_applicable" };
  }
  if (await isFrozen(wf.accountId)) return { ok: false, reason: "account_frozen" };
  if (!mayEdit(input.callerRole, input.callerUserId, wf.createdByUserId)) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, accountId: wf.accountId, provider: node.provider };
}

/**
 * Bind `connectorUserId`'s shared connection to a node. The connector must be a
 * member, have an active connection, AND be in the live `shared_with_account` set
 * for the provider — so an unshared identity can NEVER be bound (the no-silent-
 * share fence). Upserts (replaces any existing binding for the node).
 */
export async function setNodeConnectorBinding(input: {
  workflowId: string;
  nodeId: string;
  connectorUserId: string;
  callerUserId: string;
  callerRole: MembershipRole;
}): Promise<SetBindingResult> {
  if (!isConnectionSharingEnabled()) return fail("not_enabled");

  const gate = await resolveBindableNode(input);
  if (!gate.ok) return gate;
  const { accountId, provider } = gate;

  if (!(await isMemberServiceRole(accountId, input.connectorUserId))) {
    return fail("connector_not_member");
  }
  // Presence-only active-connection check (no token/label read).
  const active = await getActiveForExecution(accountId, provider, null, {
    connectedByUserId: input.connectorUserId,
  });
  if (active === null) return fail("connector_not_connected");

  // Authoritative shared-set membership (active + shared_with_account; CS-3a).
  const sharedSet = await listSharedConnectorUserIdsServiceRole(accountId, provider);
  if (!sharedSet.has(input.connectorUserId)) return fail("connector_not_shared");

  await setForNodeServiceRole({
    workflowId: input.workflowId,
    nodeId: input.nodeId,
    provider,
    connectorUserId: input.connectorUserId,
    createdByUserId: input.callerUserId,
  });
  return { ok: true };
}

/** Remove a node's connector binding. Idempotent. */
export async function clearNodeConnectorBinding(input: {
  workflowId: string;
  nodeId: string;
  callerUserId: string;
  callerRole: MembershipRole;
}): Promise<ClearBindingResult> {
  if (!isConnectionSharingEnabled()) return fail("not_enabled");

  const gate = await resolveBindableNode(input);
  if (!gate.ok) return gate;

  const { deleted } = await deleteForNodeServiceRole(input.workflowId, input.nodeId);
  return { ok: true, cleared: deleted };
}

/**
 * Eligible shared connectors for a node's provider — the safe picker. Reuses the
 * `{ userId, displayName, role }` shape (display name via the member identity RPC;
 * never email/provider account/token/scope). Editor-gated (reveals connection
 * status), mirroring the credential-owner eligible-targets endpoint.
 */
export async function listEligibleSharedConnectors(input: {
  workflowId: string;
  nodeId: string;
  callerUserId: string;
  callerRole: MembershipRole;
}): Promise<EligibleConnectorsResult> {
  if (!isConnectionSharingEnabled()) return fail("not_enabled");

  const gate = await resolveBindableNode(input);
  if (!gate.ok) return gate;
  const { accountId, provider } = gate;

  const [sharedSet, members] = await Promise.all([
    listSharedConnectorUserIdsServiceRole(accountId, provider),
    listMembers(accountId),
  ]);
  const connectors: SharedConnectorOption[] = members
    .filter((m) => sharedSet.has(m.userId))
    .map((m) => ({ userId: m.userId, displayName: m.displayName, role: m.role }));
  return { ok: true, connectors };
}

/**
 * List a workflow's node connector bindings as a safe view (display name + opaque
 * user id; no identity detail). Editor-gated.
 */
export async function listWorkflowConnectorBindings(input: {
  workflowId: string;
  callerUserId: string;
  callerRole: MembershipRole;
}): Promise<WorkflowBindingsResult> {
  if (!isConnectionSharingEnabled()) return fail("not_enabled");

  const wf = await loadWorkflow(input.workflowId);
  if (!wf) return fail("workflow_not_found");
  if (!mayEdit(input.callerRole, input.callerUserId, wf.createdByUserId)) return fail("forbidden");

  const [bindings, members] = await Promise.all([
    listByWorkflowServiceRole(input.workflowId),
    listMembers(wf.accountId),
  ]);
  const nameByUser = new Map(members.map((m) => [m.userId, m.displayName]));
  return {
    ok: true,
    bindings: bindings.map((b) => ({
      nodeId: b.nodeId,
      provider: b.provider,
      connectorUserId: b.connectorUserId,
      connectorDisplayName: nameByUser.get(b.connectorUserId) ?? null,
    })),
  };
}
