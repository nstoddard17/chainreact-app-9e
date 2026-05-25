import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";

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

export type TaskUsageEventType =
  | "node_task_charged"
  | "run_estimate_recorded"
  | "billing_reserved"
  | "billing_reconciled"
  | "billing_refunded"
  | "internal_poll_cost_recorded";

export interface TaskUsageEventInsert {
  userId: string;
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
  metadata?: Record<string, unknown>;
}

export interface TaskUsageEventRecord extends TaskUsageEventInsert {
  id: string;
  createdAt: string;
}

interface TaskUsageEventRow {
  id: string;
  user_id: string;
  workflow_id: string | null;
  workflow_run_id: string | null;
  node_id: string | null;
  provider: string | null;
  node_type: string | null;
  node_kind: string | null;
  event_type: TaskUsageEventType;
  billable: boolean;
  tasks_charged: number;
  estimated_tasks: number | null;
  actual_tasks: number | null;
  charge_on: string | null;
  cost_reason: string | null;
  cost_policy_version: string;
  test_mode: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

function toInsertRow(e: TaskUsageEventInsert): Record<string, unknown> {
  return {
    user_id: e.userId,
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

function rowToRecord(row: TaskUsageEventRow): TaskUsageEventRecord {
  return {
    id: row.id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    workflowRunId: row.workflow_run_id,
    nodeId: row.node_id,
    provider: row.provider,
    nodeType: row.node_type,
    nodeKind: row.node_kind,
    eventType: row.event_type,
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
  const { error } = await supabase
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
  const { data, error } = await supabase
    .from("task_usage_events")
    .select("*")
    .eq("workflow_run_id", runId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`task_usage_events.listByRun failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as TaskUsageEventRow));
}
