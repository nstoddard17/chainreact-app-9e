import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";

/**
 * Repository for `workflow_node_credentials`
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-2 / CS-1).
 *
 * The side table holding, per (workflow, node), an OPTIONAL credential-owner
 * override + its consent status. See
 * docs/slices/phase-4/team-workflows-credential-sharing-plan.md (Option B).
 *
 * CS-1 ships only the data foundation + these minimal helpers for later slices.
 * NO caller is wired yet, so this repository changes no runtime behavior. All
 * writes are service-role (the consent/reassignment flow runs server-side in
 * CS-3). Reads here are service-role too; account members read through RLS
 * (`workflow_node_credentials_select_account_member`) at the route layer.
 *
 * Provider rule: only PERSONAL-credential providers can be node-owned. Account/
 * service providers (Slack/Notion/Stripe/…) are account-shared and must never
 * carry a node owner — enforced here (createPendingRequest) via the single
 * classifier in core/integrations/credentialSharing.ts, NOT a duplicated map.
 */

export type NodeCredentialStatus = "pending" | "accepted" | "declined" | "revoked";

/** A node-credential grant request to insert account/service providers is rejected with this stable code. */
export const ACCOUNT_PROVIDER_NOT_NODE_OWNABLE =
  "ACCOUNT_PROVIDER_NOT_NODE_OWNABLE" as const;

/** A duplicate live (pending|accepted) grant for the same node maps to this stable code. */
export const DUPLICATE_LIVE_NODE_CREDENTIAL =
  "DUPLICATE_LIVE_NODE_CREDENTIAL" as const;

export interface WorkflowNodeCredentialRecord {
  id: string;
  workflowId: string;
  nodeId: string;
  provider: string;
  credentialOwnerUserId: string;
  status: NodeCredentialStatus;
  requestedByUserId: string | null;
  requestedAt: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowNodeCredentialsRow {
  id: string;
  workflow_id: string;
  node_id: string;
  provider: string;
  credential_owner_user_id: string;
  status: NodeCredentialStatus;
  requested_by_user_id: string | null;
  requested_at: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: WorkflowNodeCredentialsRow): WorkflowNodeCredentialRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    nodeId: row.node_id,
    provider: row.provider,
    credentialOwnerUserId: row.credential_owner_user_id,
    status: row.status,
    requestedByUserId: row.requested_by_user_id,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** All grants for a workflow (any status), newest first. Service-role. */
export async function listByWorkflowServiceRole(
  workflowId: string,
): Promise<readonly WorkflowNodeCredentialRecord[]> {
  const supabase = getServiceRoleClient(
    `workflow_node_credentials: listByWorkflow ${workflowId}`,
  );
  const { data, error } = await supabase
    .from("workflow_node_credentials")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`workflow_node_credentials.listByWorkflowServiceRole failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as WorkflowNodeCredentialsRow));
}

/** Only the ACCEPTED (effective) grants for a workflow. Service-role. */
export async function listAcceptedByWorkflowServiceRole(
  workflowId: string,
): Promise<readonly WorkflowNodeCredentialRecord[]> {
  const supabase = getServiceRoleClient(
    `workflow_node_credentials: listAcceptedByWorkflow ${workflowId}`,
  );
  const { data, error } = await supabase
    .from("workflow_node_credentials")
    .select("*")
    .eq("workflow_id", workflowId)
    .eq("status", "accepted");
  if (error) {
    throw new Error(`workflow_node_credentials.listAcceptedByWorkflowServiceRole failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as WorkflowNodeCredentialsRow));
}

/**
 * The single LIVE (pending|accepted) grant for a node, or null. The partial
 * unique index guarantees at most one. Service-role.
 */
export async function getForNodeServiceRole(
  workflowId: string,
  nodeId: string,
): Promise<WorkflowNodeCredentialRecord | null> {
  const supabase = getServiceRoleClient(
    `workflow_node_credentials: getForNode ${workflowId}/${nodeId}`,
  );
  const { data, error } = await supabase
    .from("workflow_node_credentials")
    .select("*")
    .eq("workflow_id", workflowId)
    .eq("node_id", nodeId)
    .in("status", ["pending", "accepted"])
    .maybeSingle<WorkflowNodeCredentialsRow>();
  if (error) {
    throw new Error(`workflow_node_credentials.getForNodeServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Insert a PENDING reassignment request. Rejects account/service providers
 * (`ACCOUNT_PROVIDER_NOT_NODE_OWNABLE`) and a duplicate live grant for the same
 * node (`DUPLICATE_LIVE_NODE_CREDENTIAL`, from the partial unique index).
 * Service-role.
 */
export async function createPendingRequestServiceRole(input: {
  workflowId: string;
  nodeId: string;
  provider: string;
  credentialOwnerUserId: string;
  requestedByUserId: string | null;
}): Promise<WorkflowNodeCredentialRecord> {
  // Account/service providers are account-shared and never node-owned. Gate at
  // the single classifier — do not duplicate the provider map.
  if (!isPersonalCredentialProvider(input.provider)) {
    throw new Error(ACCOUNT_PROVIDER_NOT_NODE_OWNABLE);
  }
  const supabase = getServiceRoleClient(
    `workflow_node_credentials: createPendingRequest ${input.workflowId}/${input.nodeId}`,
  );
  const { data, error } = await supabase
    .from("workflow_node_credentials")
    .insert({
      workflow_id: input.workflowId,
      node_id: input.nodeId,
      provider: input.provider,
      credential_owner_user_id: input.credentialOwnerUserId,
      requested_by_user_id: input.requestedByUserId,
      status: "pending",
    })
    .select()
    .single<WorkflowNodeCredentialsRow>();
  if (error || !data) {
    // 23505 = unique_violation → an existing live grant for this node.
    if (error?.code === "23505") {
      throw new Error(DUPLICATE_LIVE_NODE_CREDENTIAL);
    }
    throw new Error(
      `workflow_node_credentials.createPendingRequestServiceRole failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRecord(data);
}

/** Transition a PENDING grant to ACCEPTED (the target member consents). Service-role. */
export async function markAcceptedServiceRole(
  id: string,
  decidedAt: string,
): Promise<void> {
  const supabase = getServiceRoleClient(`workflow_node_credentials: markAccepted ${id}`);
  const { error } = await supabase
    .from("workflow_node_credentials")
    .update({ status: "accepted", decided_at: decidedAt })
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    throw new Error(`workflow_node_credentials.markAcceptedServiceRole failed: ${error.message}`);
  }
}

/** Transition a PENDING grant to DECLINED (the target member declines). Service-role. */
export async function markDeclinedServiceRole(
  id: string,
  decidedAt: string,
): Promise<void> {
  const supabase = getServiceRoleClient(`workflow_node_credentials: markDeclined ${id}`);
  const { error } = await supabase
    .from("workflow_node_credentials")
    .update({ status: "declined", decided_at: decidedAt })
    .eq("id", id)
    .eq("status", "pending");
  if (error) {
    throw new Error(`workflow_node_credentials.markDeclinedServiceRole failed: ${error.message}`);
  }
}

/**
 * Transition a LIVE (pending|accepted) grant to REVOKED — manual revoke or
 * offboarding (CS-6). After revoke, the node falls back to the workflow creator.
 * Service-role.
 */
export async function markRevokedServiceRole(
  id: string,
  decidedAt: string,
): Promise<void> {
  const supabase = getServiceRoleClient(`workflow_node_credentials: markRevoked ${id}`);
  const { error } = await supabase
    .from("workflow_node_credentials")
    .update({ status: "revoked", decided_at: decidedAt })
    .eq("id", id)
    .in("status", ["pending", "accepted"]);
  if (error) {
    throw new Error(`workflow_node_credentials.markRevokedServiceRole failed: ${error.message}`);
  }
}

/**
 * All ACCEPTED grants OWNED BY `ownerUserId` across the workflows in `accountId`
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-7 / CS-6 — offboarding impact).
 *
 * The side table has no `account_id`, so scope is resolved through the
 * `workflow_id → workflows` FK embed (`workflows!inner(account_id)` +
 * `eq("workflows.account_id", …)`). ACCEPTED-only on purpose: a `pending` grant
 * is inert (CS-2 never resolves to it), so it does NOT represent a step that
 * "will stop running" if the owner leaves — only accepted grants do. Service-role.
 */
export async function listAcceptedOwnedByUserInAccountServiceRole(
  accountId: string,
  ownerUserId: string,
): Promise<readonly WorkflowNodeCredentialRecord[]> {
  const supabase = getServiceRoleClient(
    `workflow_node_credentials: listAcceptedOwnedByUserInAccount ${accountId}/${ownerUserId}`,
  );
  const { data, error } = await supabase
    .from("workflow_node_credentials")
    .select("*, workflows!inner(account_id)")
    .eq("workflows.account_id", accountId)
    .eq("credential_owner_user_id", ownerUserId)
    .eq("status", "accepted");
  if (error) {
    throw new Error(
      `workflow_node_credentials.listAcceptedOwnedByUserInAccountServiceRole failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => rowToRecord(r as unknown as WorkflowNodeCredentialsRow));
}

/**
 * Revoke EVERY live (pending|accepted) grant OWNED BY `credentialOwnerUserId`
 * across the workflows in `accountId` — Slice 4.TEAM-WORKFLOWS-CREDENTIAL-
 * SHARING-7 / CS-6 offboarding (member remove / leave). After revoke those nodes
 * deterministically fall back to the workflow creator (CS-2), so no accepted
 * grant is ever left pointing at a removed / disconnected user.
 *
 * Always safe to call: a member who owns no live grants yields a 0-row no-op
 * (one cheap indexed read, no write). Idempotent — the live-status guard means a
 * second call revokes nothing. Independent of the reassignment feature flag: it
 * is pure data hygiene, not a runtime resolution decision.
 *
 * An UPDATE cannot filter on an embedded resource, so the in-account live grant
 * ids are resolved via the FK embed first, then revoked by id under the
 * live-status guard. Returns the number of rows actually transitioned to
 * `revoked`. Service-role.
 */
export async function revokeLiveForMemberServiceRole(input: {
  accountId: string;
  credentialOwnerUserId: string;
  now?: string;
}): Promise<{ revokedCount: number }> {
  const supabase = getServiceRoleClient(
    `workflow_node_credentials: revokeLiveForMember ${input.accountId}/${input.credentialOwnerUserId}`,
  );
  const { data: live, error: selectError } = await supabase
    .from("workflow_node_credentials")
    .select("id, workflows!inner(account_id)")
    .eq("workflows.account_id", input.accountId)
    .eq("credential_owner_user_id", input.credentialOwnerUserId)
    .in("status", ["pending", "accepted"]);
  if (selectError) {
    throw new Error(
      `workflow_node_credentials.revokeLiveForMemberServiceRole select failed: ${selectError.message}`,
    );
  }
  const ids = (live ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) return { revokedCount: 0 };

  const { data: revoked, error: updateError } = await supabase
    .from("workflow_node_credentials")
    .update({ status: "revoked", decided_at: input.now ?? new Date().toISOString() })
    .in("id", ids)
    .in("status", ["pending", "accepted"])
    .select("id");
  if (updateError) {
    throw new Error(
      `workflow_node_credentials.revokeLiveForMemberServiceRole update failed: ${updateError.message}`,
    );
  }
  return { revokedCount: (revoked ?? []).length };
}
