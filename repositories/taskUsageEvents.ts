import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import { asTypedDb } from "./supabase/typedDb";
import { z } from "zod";
import type { TableInsert, TableRow } from "@/types/tables";
import type { Json } from "@/types/database.types";

/**
 * Repository for task_usage_events (Slice 4.COST-3) — the append-only task
 * usage ledger.
 *
 * Writes go through the service-role client: the engine records usage in the
 * background after a run finishes, with no user session. Reads go through the
 * SSR-cookie client so RLS gates each user to their own events.
 *
 * NEVER persist raw config / secrets / tokens / payloads. Callers pass only
 * node identity, policy classification, task counts, and a redacted numeric
 * `metadata` summary.
 */

export const TaskUsageEventTypeSchema = z.enum([
  "node_task_charged",
  "run_estimate_recorded",
  "billing_reserved",
  "billing_reconciled",
  "billing_refunded",
  "internal_poll_cost_recorded",
]);

export type TaskUsageEventType =
  | "node_task_charged"
  | "run_estimate_recorded"
  | "billing_reserved"
  | "billing_reconciled"
  | "billing_refunded"
  | "internal_poll_cost_recorded";

export interface TaskUsageEventInsert {
  /** NULL on ledger-anonymized rows (account_id is cleared on purge). */
  accountId: string | null;
  workflowId: string | null;
  workflowRunId: string | null;
  nodeId?: string | null;
  provider?: string | null;
  nodeType?: string | null;
  nodeKind?: string | null;
  eventType: TaskUsageEventType;
  billable: boolean;
  tasksCharged: number;
  estimatedTasks?: number | null;
  actualTasks?: number | null;
  chargeOn?: string | null;
  costReason?: string | null;
  costPolicyVersion: string;
  testMode: boolean;
  /** Redacted numeric summary only — never node config. */
  metadata?: Json;
}

export interface TaskUsageEventRecord extends TaskUsageEventInsert {
  id: string;
  createdAt: string;
}

function toInsertRow(e: TaskUsageEventInsert): TableInsert<"task_usage_events"> {
  return {
    account_id: e.accountId,
    workflow_id: e.workflowId,
    workflow_run_id: e.workflowRunId,
    node_id: e.nodeId ?? null,
    provider: e.provider ?? null,
    node_type: e.nodeType ?? null,
    node_kind: e.nodeKind ?? null,
    event_type: e.eventType,
    billable: e.billable,
    tasks_charged: e.tasksCharged,
    estimated_tasks: e.estimatedTasks ?? null,
    actual_tasks: e.actualTasks ?? null,
    charge_on: e.chargeOn ?? null,
    cost_reason: e.costReason ?? null,
    cost_policy_version: e.costPolicyVersion,
    test_mode: e.testMode,
    metadata: e.metadata ?? {},
  };
}

function rowToRecord(row: TableRow<"task_usage_events">): TaskUsageEventRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    workflowId: row.workflow_id,
    workflowRunId: row.workflow_run_id,
    nodeId: row.node_id,
    provider: row.provider,
    nodeType: row.node_type,
    nodeKind: row.node_kind,
    eventType: TaskUsageEventTypeSchema.parse(row.event_type),
    billable: row.billable,
    tasksCharged: row.tasks_charged,
    estimatedTasks: row.estimated_tasks,
    actualTasks: row.actual_tasks,
    chargeOn: row.charge_on,
    costReason: row.cost_reason,
    costPolicyVersion: row.cost_policy_version,
    testMode: row.test_mode,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

/** Append one or more usage events. No-op for an empty array. */
export async function insertEvents(
  events: readonly TaskUsageEventInsert[],
): Promise<void> {
  if (events.length === 0) return;
  const supabase = getServiceRoleClient(
    `engine: task_usage_events insert (${events.length})`,
  );
  const db = asTypedDb(supabase);
  const { error } = await db
    .from("task_usage_events")
    .insert(events.map(toInsertRow));
  if (error) {
    throw new Error(`task_usage_events.insertEvents failed: ${error.message}`);
  }
}

/** List a run's usage events (RLS-gated to the caller's own rows). */
export async function listByRun(
  runId: string,
): Promise<readonly TaskUsageEventRecord[]> {
  const supabase = await createClient();
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("task_usage_events")
    .select("*")
    .eq("workflow_run_id", runId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`task_usage_events.listByRun failed: ${error.message}`);
  }
  return (data ?? []).map(rowToRecord);
}

/** Filters for an owner/admin analytics range read (COST-7). */
export interface TaskUsageAnalyticsQuery {
  /** Inclusive lower bound on created_at (ISO timestamp). */
  from?: string;
  /** Inclusive upper bound on created_at (ISO timestamp). */
  to?: string;
  /** Optional single-user scope (owner viewing one user). */
  accountId?: string;
  /** Optional single-workflow scope. */
  workflowId?: string;
  /** Optional row cap (defense against unbounded loads). */
  limit?: number;
}

/**
 * Owner/admin cross-user range read for analytics (COST-7).
 *
 * Uses the SERVICE-ROLE client and therefore BYPASSES RLS — it is for
 * server-side owner/admin analytics ONLY. It must never be wired into a
 * normal-user-facing path; per-user surfaces use the RLS-gated `listByRun`
 * or pass an explicit `accountId` filter here behind an admin authorization
 * check at the call site.
 */
export async function listEventsForAnalytics(
  q: TaskUsageAnalyticsQuery = {},
): Promise<readonly TaskUsageEventRecord[]> {
  const supabase = getServiceRoleClient(
    "analytics: task_usage_events range read (owner/admin)",
  );
  const db = asTypedDb(supabase);
  let query = db.from("task_usage_events").select("*");
  if (q.from) query = query.gte("created_at", q.from);
  if (q.to) query = query.lte("created_at", q.to);
  if (q.accountId) query = query.eq("account_id", q.accountId);
  if (q.workflowId) query = query.eq("workflow_id", q.workflowId);
  query = query.order("created_at", { ascending: false });
  if (q.limit !== undefined) query = query.limit(q.limit);
  const { data, error } = await query;
  if (error) {
    throw new Error(
      `task_usage_events.listEventsForAnalytics failed: ${error.message}`,
    );
  }
  return (data ?? []).map(rowToRecord);
}
