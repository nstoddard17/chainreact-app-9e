import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";

/**
 * Repository for `workflow_node_connector_bindings` (Slice 4.CONN-SHARE / CS-4a).
 *
 * Direct per-node connector binding (NOT the consent-gated
 * `workflow_node_credentials` — see the migration header / plan §15.1). Holds,
 * per (workflow, node), the connector user whose explicitly-shared personal
 * connection that node should run under. CS-4a ships storage + these helpers; NO
 * resolver/gate reads them yet (behavior-inert until CS-4b).
 *
 * All writes are service-role (the binding service authorizes connector/editor +
 * shared-set membership). Reads here are service-role too; account members read
 * through RLS (`workflow_node_connector_bindings_select_account_member`) at the
 * route layer. Provider rule: only PERSONAL-credential providers are bindable —
 * enforced here via the single classifier, NOT a duplicated SQL map.
 */

export const ACCOUNT_PROVIDER_NOT_BINDABLE = "ACCOUNT_PROVIDER_NOT_BINDABLE" as const;

export interface WorkflowNodeConnectorBindingRecord {
  id: string;
  workflowId: string;
  nodeId: string;
  provider: string;
  connectorUserId: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowNodeConnectorBindingsRow {
  id: string;
  workflow_id: string;
  node_id: string;
  provider: string;
  connector_user_id: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: WorkflowNodeConnectorBindingsRow): WorkflowNodeConnectorBindingRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    nodeId: row.node_id,
    provider: row.provider,
    connectorUserId: row.connector_user_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** All bindings for a workflow (builder/resolution read path). Service-role. */
export async function listByWorkflowServiceRole(
  workflowId: string,
): Promise<readonly WorkflowNodeConnectorBindingRecord[]> {
  const supabase = getServiceRoleClient(
    `workflow_node_connector_bindings: listByWorkflow ${workflowId}`,
  );
  const { data, error } = await supabase
    .from("workflow_node_connector_bindings")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`workflow_node_connector_bindings.listByWorkflowServiceRole failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as WorkflowNodeConnectorBindingsRow));
}

/** The binding for one node, or null. The unique index guarantees at most one. Service-role. */
export async function getForNodeServiceRole(
  workflowId: string,
  nodeId: string,
): Promise<WorkflowNodeConnectorBindingRecord | null> {
  const supabase = getServiceRoleClient(
    `workflow_node_connector_bindings: getForNode ${workflowId}/${nodeId}`,
  );
  const { data, error } = await supabase
    .from("workflow_node_connector_bindings")
    .select("*")
    .eq("workflow_id", workflowId)
    .eq("node_id", nodeId)
    .maybeSingle<WorkflowNodeConnectorBindingsRow>();
  if (error) {
    throw new Error(`workflow_node_connector_bindings.getForNodeServiceRole failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Upsert the binding for one node (set or replace the connector). Keyed on the
 * `(workflow_id, node_id)` unique index. Rejects account/service providers
 * (`ACCOUNT_PROVIDER_NOT_BINDABLE`) at the single classifier. Service-role.
 */
export async function setForNodeServiceRole(input: {
  workflowId: string;
  nodeId: string;
  provider: string;
  connectorUserId: string;
  createdByUserId: string | null;
}): Promise<WorkflowNodeConnectorBindingRecord> {
  if (!isPersonalCredentialProvider(input.provider)) {
    throw new Error(ACCOUNT_PROVIDER_NOT_BINDABLE);
  }
  const supabase = getServiceRoleClient(
    `workflow_node_connector_bindings: setForNode ${input.workflowId}/${input.nodeId}`,
  );
  const { data, error } = await supabase
    .from("workflow_node_connector_bindings")
    .upsert(
      {
        workflow_id: input.workflowId,
        node_id: input.nodeId,
        provider: input.provider,
        connector_user_id: input.connectorUserId,
        created_by_user_id: input.createdByUserId,
      },
      { onConflict: "workflow_id,node_id" },
    )
    .select()
    .single<WorkflowNodeConnectorBindingsRow>();
  if (error || !data) {
    throw new Error(
      `workflow_node_connector_bindings.setForNodeServiceRole failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRecord(data);
}

/** Delete the binding for one node. Idempotent — returns whether a row was removed. Service-role. */
export async function deleteForNodeServiceRole(
  workflowId: string,
  nodeId: string,
): Promise<{ deleted: boolean }> {
  const supabase = getServiceRoleClient(
    `workflow_node_connector_bindings: deleteForNode ${workflowId}/${nodeId}`,
  );
  const { data, error } = await supabase
    .from("workflow_node_connector_bindings")
    .delete()
    .eq("workflow_id", workflowId)
    .eq("node_id", nodeId)
    .select("id");
  if (error) {
    throw new Error(`workflow_node_connector_bindings.deleteForNodeServiceRole failed: ${error.message}`);
  }
  return { deleted: (data ?? []).length > 0 };
}
