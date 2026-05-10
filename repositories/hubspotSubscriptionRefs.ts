import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for `hubspot_subscription_refs`.
 *
 * Slice 13 Commit 2 — Option A (shared subscriptions with portal-scoped
 * reference counting).
 *
 * Each row represents one V2 workflow node's reference to a HubSpot
 * app-level subscription (`hubspot_app_subscriptions`). The lifecycle
 * service:
 *   - Adds a row on activate.
 *   - Removes a row on deactivate.
 *   - Counts remaining rows; if zero, deletes the parent
 *     `hubspot_app_subscriptions` row + DELETEs the HubSpot
 *     subscription.
 *
 * The receive-route uses this table for routing: given an event's
 * `portalId` + `subscriptionType` + (optionally) `propertyName`, find
 * the active rows where `app_subscription_id` matches and `hub_id`
 * matches the user's portal, then dispatch each match.
 *
 * Service-role only — the table is `system-table` per migration. Every
 * call site supplies a `reason` string for the audit log.
 */

export interface HubSpotSubscriptionRefRecord {
  id: string;
  appSubscriptionId: string;
  workflowId: string;
  userId: string;
  nodeId: string;
  hubId: string;
  config: Readonly<Record<string, unknown>>;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

interface HubSpotSubscriptionRefRow {
  id: string;
  app_subscription_id: string;
  workflow_id: string;
  user_id: string;
  node_id: string;
  hub_id: string;
  config: Record<string, unknown>;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

function rowToRecord(
  row: HubSpotSubscriptionRefRow,
): HubSpotSubscriptionRefRecord {
  return {
    id: row.id,
    appSubscriptionId: row.app_subscription_id,
    workflowId: row.workflow_id,
    userId: row.user_id,
    nodeId: row.node_id,
    hubId: row.hub_id,
    config: row.config,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertRefInput {
  appSubscriptionId: string;
  workflowId: string;
  userId: string;
  nodeId: string;
  hubId: string;
  config?: Record<string, unknown>;
}

/**
 * Insert a ref row, or no-op if one already exists for the same
 * (app_subscription_id, workflow_id, node_id) triple. Returns the row
 * (newly created OR pre-existing).
 *
 * Idempotent re-running of activate for the same workflow node is a
 * normal operating mode (lifecycle retry after partial failure).
 */
export async function upsert(
  input: UpsertRefInput,
): Promise<HubSpotSubscriptionRefRecord> {
  const supabase = getServiceRoleClient(
    `hubspot_subscription_refs: upsert wf=${input.workflowId} node=${input.nodeId}`,
  );
  const { data, error } = await supabase
    .from("hubspot_subscription_refs")
    .upsert(
      {
        app_subscription_id: input.appSubscriptionId,
        workflow_id: input.workflowId,
        user_id: input.userId,
        node_id: input.nodeId,
        hub_id: input.hubId,
        config: input.config ?? {},
        status: "active",
      },
      { onConflict: "app_subscription_id,workflow_id,node_id" },
    )
    .select()
    .single<HubSpotSubscriptionRefRow>();
  if (error || !data) {
    throw new Error(
      `hubspot_subscription_refs.upsert failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToRecord(data);
}

/**
 * Delete the ref row for the given (app_subscription_id, workflow_id,
 * node_id) triple. Returns the deleted row or null if no row matched.
 * The deactivate caller uses the result + a follow-up `countRefs` to
 * decide whether to delete the parent app-subscription.
 */
export async function deleteOne(input: {
  appSubscriptionId: string;
  workflowId: string;
  nodeId: string;
}): Promise<HubSpotSubscriptionRefRecord | null> {
  const supabase = getServiceRoleClient(
    `hubspot_subscription_refs: deleteOne wf=${input.workflowId} node=${input.nodeId}`,
  );
  const { data, error } = await supabase
    .from("hubspot_subscription_refs")
    .delete()
    .eq("app_subscription_id", input.appSubscriptionId)
    .eq("workflow_id", input.workflowId)
    .eq("node_id", input.nodeId)
    .select()
    .maybeSingle<HubSpotSubscriptionRefRow>();
  if (error) {
    throw new Error(
      `hubspot_subscription_refs.deleteOne failed: ${error.message}`,
    );
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Count remaining refs for a given app-subscription. Used after
 * `deleteOne` in the deactivate path: if the count is zero, the parent
 * app-subscription should be deleted (HubSpot DELETE + V2 row removal).
 */
export async function countRefs(appSubscriptionId: string): Promise<number> {
  const supabase = getServiceRoleClient(
    `hubspot_subscription_refs: countRefs ${appSubscriptionId}`,
  );
  const { count, error } = await supabase
    .from("hubspot_subscription_refs")
    .select("*", { count: "exact", head: true })
    .eq("app_subscription_id", appSubscriptionId);
  if (error) {
    throw new Error(
      `hubspot_subscription_refs.countRefs failed: ${error.message}`,
    );
  }
  return count ?? 0;
}

/**
 * List all refs for a workflow. Used by the deactivate path to walk
 * each ref, delete it, and check whether the parent subscription
 * should be cleaned up.
 */
export async function listByWorkflow(
  workflowId: string,
): Promise<readonly HubSpotSubscriptionRefRecord[]> {
  const supabase = getServiceRoleClient(
    `hubspot_subscription_refs: listByWorkflow ${workflowId}`,
  );
  const { data, error } = await supabase
    .from("hubspot_subscription_refs")
    .select("*")
    .eq("workflow_id", workflowId);
  if (error) {
    throw new Error(
      `hubspot_subscription_refs.listByWorkflow failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) =>
    rowToRecord(r as HubSpotSubscriptionRefRow),
  );
}

/**
 * Receive-route hot path: find every active ref for a given
 * `(app_subscription_id, hub_id)` pair. The caller has already mapped
 * the inbound event's `subscriptionType` (+ optional `propertyName`) to
 * a single `app_subscription_id`, and the event's `portalId` to the
 * `hub_id`. The matching refs are the workflows that should fire.
 *
 * Returns multiple rows when more than one workflow under the same
 * portal subscribes to the same event type.
 */
export async function listForDispatch(input: {
  appSubscriptionId: string;
  hubId: string;
}): Promise<readonly HubSpotSubscriptionRefRecord[]> {
  const supabase = getServiceRoleClient(
    `hubspot_subscription_refs: listForDispatch sub=${input.appSubscriptionId} hub=${input.hubId}`,
  );
  const { data, error } = await supabase
    .from("hubspot_subscription_refs")
    .select("*")
    .eq("app_subscription_id", input.appSubscriptionId)
    .eq("hub_id", input.hubId)
    .eq("status", "active");
  if (error) {
    throw new Error(
      `hubspot_subscription_refs.listForDispatch failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) =>
    rowToRecord(r as HubSpotSubscriptionRefRow),
  );
}
