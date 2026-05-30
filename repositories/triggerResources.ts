import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for trigger_resources.
 *
 * Per docs/rules/database-security.md + workflow-lifecycle.md:
 *   - User-scoped writes (insert / delete) go through the SSR auth client
 *     so RLS gates per-user access.
 *   - Dispatcher lookups happen on inbound webhooks with no user session;
 *     they go through the service-role client (RLS bypass) and filter on
 *     the canonical (provider, eventType) index.
 *
 * Naming note (Slice 4.ACCOUNT-MODEL-6): the underlying column
 * `trigger_resources.account_id` (text) stores the *provider* account id
 * (Slack team_id, Notion workspace, HubSpot portal, etc.) and is NOT
 * renamed at the database layer. At the TypeScript layer we surface it
 * as `providerAccountId` so it cannot be confused with the V2 ownership
 * `accountId` that workflows / integrations now carry. The owning
 * workflow's V2 account is surfaced as `workflowAccountId`, populated
 * via a join against `workflows.account_id` in the read paths used by
 * trigger handlers (pull / renew / poll / webhook-receive / activate /
 * deactivate). It's optional because not every read path joins the
 * workflow row; callers that need it use the *ForHandler / *ForDispatch
 * variants.
 */

export interface TriggerResourceRecord {
  id: string;
  workflowId: string;
  /**
   * V2 account that owns the owning workflow. Populated when the read
   * path joins `workflows.account_id`. Handlers that need to look up
   * integrations consume this — never `userId`. Null when the read
   * path is a bare-row select (e.g. internal admin tools).
   */
  workflowAccountId: string | null;
  userId: string;
  provider: string;
  eventType: string;
  nodeId: string;
  config: Readonly<Record<string, unknown>>;
  /**
   * Provider-side account id (Slack team_id, Notion workspace, etc.).
   * Renamed from `accountId` in Slice 4.ACCOUNT-MODEL-6 to disambiguate
   * from the V2 `workflowAccountId`. Maps to the `account_id` column,
   * which is deliberately not renamed at the DB layer.
   */
  providerAccountId: string | null;
  registeredAt: string;
  expiresAt: string | null;
  lastRenewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TriggerResourcesRow {
  id: string;
  workflow_id: string;
  user_id: string;
  provider: string;
  event_type: string;
  node_id: string;
  config: Record<string, unknown>;
  account_id: string | null;
  registered_at: string;
  expires_at: string | null;
  last_renewed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Row shape for the read paths that join `workflows.account_id` so the
 * caller gets the V2 owning account alongside the trigger resource.
 * The join column lands at `workflows.account_id`; PostgREST returns it
 * nested as `workflows: { account_id }` (or null when the workflow row
 * was hard-deleted, which today only happens via service-role cleanup
 * paths).
 */
interface TriggerResourcesRowWithWorkflow extends TriggerResourcesRow {
  workflows: { account_id: string } | null;
}

function rowToRecord(
  row: TriggerResourcesRow,
  workflowAccountId: string | null = null,
): TriggerResourceRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowAccountId,
    userId: row.user_id,
    provider: row.provider,
    eventType: row.event_type,
    nodeId: row.node_id,
    config: row.config,
    providerAccountId: row.account_id,
    registeredAt: row.registered_at,
    expiresAt: row.expires_at,
    lastRenewedAt: row.last_renewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function joinedRowToRecord(
  row: TriggerResourcesRowWithWorkflow,
): TriggerResourceRecord {
  return rowToRecord(row, row.workflows?.account_id ?? null);
}

export interface UpsertTriggerResourceInput {
  workflowId: string;
  userId: string;
  provider: string;
  eventType: string;
  nodeId: string;
  config?: Record<string, unknown>;
  /**
   * Provider-side account id (e.g. Slack team_id). Maps to the
   * `account_id` column. Renamed from `accountId` in Slice
   * 4.ACCOUNT-MODEL-6 for symmetry with the surfaced field name.
   */
  providerAccountId?: string | null;
  expiresAt?: string | null;
}

/**
 * Insert or update a trigger registration. The unique index on
 * (workflow_id, node_id) means a re-register for the same trigger node
 * updates in place — useful when activate runs twice (e.g. retry after a
 * failed orchestrator persist).
 */
export async function upsert(
  input: UpsertTriggerResourceInput,
): Promise<TriggerResourceRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trigger_resources")
    .upsert(
      {
        workflow_id: input.workflowId,
        user_id: input.userId,
        provider: input.provider,
        event_type: input.eventType,
        node_id: input.nodeId,
        config: input.config ?? {},
        account_id: input.providerAccountId ?? null,
        expires_at: input.expiresAt ?? null,
        last_renewed_at: null,
      },
      { onConflict: "workflow_id,node_id" },
    )
    .select()
    .single<TriggerResourcesRow>();
  if (error || !data) {
    throw new Error(
      `trigger_resources.upsert failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToRecord(data);
}

export async function deleteByWorkflow(workflowId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("trigger_resources")
    .delete()
    .eq("workflow_id", workflowId);
  if (error) {
    throw new Error(`trigger_resources.deleteByWorkflow failed: ${error.message}`);
  }
}

export async function listByWorkflow(
  workflowId: string,
): Promise<readonly TriggerResourceRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trigger_resources")
    .select("*, workflows!inner(account_id)")
    .eq("workflow_id", workflowId);
  if (error) {
    throw new Error(`trigger_resources.listByWorkflow failed: ${error.message}`);
  }
  return (data ?? []).map((r) =>
    joinedRowToRecord(r as TriggerResourcesRowWithWorkflow),
  );
}

/**
 * Dispatcher path: called from webhook receipt with no user session. Uses
 * the service-role client so RLS doesn't gate the lookup. Joins
 * `workflows.account_id` so the dispatcher can route the event into the
 * engine with the V2 ownership account already resolved.
 */
export async function listForDispatch(
  provider: string,
  eventType: string,
): Promise<readonly TriggerResourceRecord[]> {
  const supabase = getServiceRoleClient(
    `webhook dispatcher: lookup trigger_resources for ${provider}/${eventType}`,
  );
  const { data, error } = await supabase
    .from("trigger_resources")
    .select("*, workflows!inner(account_id)")
    .eq("provider", provider)
    .eq("event_type", eventType);
  if (error) {
    throw new Error(`trigger_resources.listForDispatch failed: ${error.message}`);
  }
  return (data ?? []).map((r) =>
    joinedRowToRecord(r as TriggerResourcesRowWithWorkflow),
  );
}

/**
 * Polling-cron path: called from `/api/cron/poll-triggers` with no user
 * session. Returns every trigger_resources row whose JSONB `config`
 * contains `pollingEnabled: true`.
 *
 * Slice 2e: V1 used the same `config @> {pollingEnabled: true}` filter
 * (poll-triggers/route.ts:34); we keep the convention so the JSONB shape
 * stays portable between V1 and V2 polling triggers.
 *
 * Workflow state gate is the caller's responsibility — the polling cron
 * checks `workflows.state === 'active'` per row before dispatching, same
 * pattern as the webhook dispatcher (V2 lifecycle deletes the row on
 * disable, but the gate is belt-and-suspenders for the in-flight window).
 */
export async function listForPolling(): Promise<
  readonly TriggerResourceRecord[]
> {
  const supabase = getServiceRoleClient(
    "polling cron: list trigger_resources where config.pollingEnabled = true",
  );
  const { data, error } = await supabase
    .from("trigger_resources")
    .select("*, workflows!inner(account_id)")
    .contains("config", { pollingEnabled: true });
  if (error) {
    throw new Error(`trigger_resources.listForPolling failed: ${error.message}`);
  }
  return (data ?? []).map((r) =>
    joinedRowToRecord(r as TriggerResourcesRowWithWorkflow),
  );
}

/**
 * Webhook-receive direct lookup: find the single trigger_resources row
 * for a given (workflow, node) pair.
 *
 * Slice 11 (Stripe) introduces this helper for receive-routes that
 * resolve the trigger via URL query params (`?workflowId=X&nodeId=Y`)
 * rather than via a provider-echoed id in the body. Stripe events
 * carry no endpoint identifier, so the URL is the only stable signal
 * — strict-direct-lookup avoids V1's multi-secret fallback rot.
 *
 * Service-role only — webhook receive runs with no user session.
 * Returns `null` when no row matches (the route maps to a 404 / quiet
 * ack). The unique index on `(workflow_id, node_id)` guarantees
 * single-row results.
 */
export async function findByWorkflowAndNode(
  workflowId: string,
  nodeId: string,
): Promise<TriggerResourceRecord | null> {
  const supabase = getServiceRoleClient(
    `webhook receive: findByWorkflowAndNode ${workflowId}/${nodeId}`,
  );
  const { data, error } = await supabase
    .from("trigger_resources")
    .select("*, workflows!inner(account_id)")
    .eq("workflow_id", workflowId)
    .eq("node_id", nodeId)
    .maybeSingle<TriggerResourcesRowWithWorkflow>();
  if (error) {
    throw new Error(
      `trigger_resources.findByWorkflowAndNode failed: ${error.message}`,
    );
  }
  return data ? joinedRowToRecord(data) : null;
}

/**
 * Generic JSONB-containment lookup.
 *
 * Used by:
 *   - The renewal cron (`config @> { type: 'subscription-watch' }`).
 *   - The Calendar webhook receiver (`config @> { channelId: '...' }`).
 *
 * Service-role only — system-level cron + webhook paths run with no user
 * session. For the per-workflow lookup paths (lifecycle.ts), use
 * `listByWorkflow` instead.
 */
export async function listByConfigContains(
  contains: Record<string, unknown>,
): Promise<readonly TriggerResourceRecord[]> {
  const supabase = getServiceRoleClient(
    `trigger_resources: listByConfigContains ${JSON.stringify(Object.keys(contains))}`,
  );
  const { data, error } = await supabase
    .from("trigger_resources")
    .select("*, workflows!inner(account_id)")
    .contains("config", contains);
  if (error) {
    throw new Error(
      `trigger_resources.listByConfigContains failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) =>
    joinedRowToRecord(r as TriggerResourcesRowWithWorkflow),
  );
}

/**
 * Polling-cron path: persist updated `config` JSONB back to a
 * trigger_resources row. Slice 2e uses this to advance the historyId
 * checkpoint and bump `polling.lastPolledAt` after each poll cycle.
 *
 * Service-role: runs from cron with no user session. The service-role
 * write is bounded to a known row id (caller already authenticated the
 * cron via `requireCronAuth`).
 */
export async function updateConfig(
  id: string,
  config: Record<string, unknown>,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `polling cron: updateConfig for trigger_resources ${id}`,
  );
  const { error } = await supabase
    .from("trigger_resources")
    .update({ config, last_renewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    throw new Error(`trigger_resources.updateConfig failed: ${error.message}`);
  }
}
