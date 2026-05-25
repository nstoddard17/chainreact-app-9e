import { createClient } from "@/utils/supabase/server";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Repository for workflow_runs.
 *
 * Engine path (recordRun) writes via service-role — runs persist in
 * background after a webhook returns 200, with no user session.
 *
 * UI path (listByWorkflow) reads via the SSR-cookie client so RLS gates
 * per-user access.
 */

export type WorkflowRunStatus = "succeeded" | "failed";

export interface WorkflowRunStep {
  nodeId: string;
  status: "succeeded" | "failed" | "skipped";
  output?: Readonly<Record<string, unknown>>;
  error?: {
    code: string;
    message: string;
    details?: Readonly<Record<string, unknown>>;
  };
}

export interface WorkflowRunFatalError {
  code: string;
  message: string;
}

export interface WorkflowRunErrorClassification {
  title: string;
  description: string;
  hint?: string;
  action?: "reconnect" | "open_node" | "upgrade_plan";
  severity: "warning" | "error";
}

/**
 * Slice 3.SEC-2 — `triggered_by` value set. Mirrors the CHECK constraint
 * in `supabase/migrations/20260523000000_workflow_runs_test_mode.sql`.
 * Adding a new source = migration + this union edit.
 */
export type WorkflowRunTriggeredBy =
  | "manual"
  | "test"
  | "webhook"
  | "scheduled"
  | "retry"
  | "unknown";

export interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  userId: string;
  status: WorkflowRunStatus;
  triggerNodeId: string;
  triggerEvent: TriggerEvent;
  steps: readonly WorkflowRunStep[];
  fatalError: WorkflowRunFatalError | null;
  errorClassification: WorkflowRunErrorClassification | null;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
  /** Slice 3.SEC-2 — true when engine ran in test mode. */
  isTest: boolean;
  /** Slice 3.SEC-2 — how the run was started. */
  triggeredBy: WorkflowRunTriggeredBy;
}

interface WorkflowRunsRow {
  id: string;
  workflow_id: string;
  user_id: string;
  status: WorkflowRunStatus;
  trigger_node_id: string;
  trigger_event: TriggerEvent;
  steps: WorkflowRunStep[];
  fatal_error: WorkflowRunFatalError | null;
  error_classification: WorkflowRunErrorClassification | null;
  started_at: string;
  finished_at: string;
  created_at: string;
  is_test: boolean;
  triggered_by: WorkflowRunTriggeredBy;
}

function rowToRecord(row: WorkflowRunsRow): WorkflowRunRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    userId: row.user_id,
    status: row.status,
    triggerNodeId: row.trigger_node_id,
    triggerEvent: row.trigger_event,
    steps: row.steps,
    fatalError: row.fatal_error,
    errorClassification: row.error_classification,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    isTest: row.is_test,
    triggeredBy: row.triggered_by,
  };
}

export interface RecordRunInput {
  /** Engine-assigned run id (also the row's id). */
  runId: string;
  workflowId: string;
  userId: string;
  status: WorkflowRunStatus;
  triggerNodeId: string;
  triggerEvent: TriggerEvent;
  steps: readonly WorkflowRunStep[];
  fatalError?: WorkflowRunFatalError | null;
  errorClassification?: WorkflowRunErrorClassification | null;
  startedAt: string;
  finishedAt: string;
  /**
   * Slice 3.SEC-2 — provenance columns. Both are persisted to
   * workflow_runs. The DB columns have defaults (false / 'unknown') so
   * pre-SEC-2 rows survive, but the engine always supplies them.
   */
  isTest: boolean;
  triggeredBy: WorkflowRunTriggeredBy;
  /**
   * Slice 4.COST-3 — per-run cost columns (ledger-only; live billing is
   * still flat 1/run). Populated for real runs; null for test runs and
   * fatal-before-execution paths. `taskCostPolicyVersion` pins the COST-2
   * policy a run was costed under.
   */
  estimatedTaskCost?: number | null;
  actualTaskCost?: number | null;
  taskCostPolicyVersion?: string | null;
}

export async function recordRun(input: RecordRunInput): Promise<void> {
  const supabase = getServiceRoleClient(
    `engine: recordRun ${input.runId} (workflow ${input.workflowId})`,
  );
  const { error } = await supabase.from("workflow_runs").insert({
    id: input.runId,
    workflow_id: input.workflowId,
    user_id: input.userId,
    status: input.status,
    trigger_node_id: input.triggerNodeId,
    trigger_event: input.triggerEvent,
    steps: input.steps as readonly WorkflowRunStep[],
    fatal_error: input.fatalError ?? null,
    error_classification: input.errorClassification ?? null,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    is_test: input.isTest,
    triggered_by: input.triggeredBy,
    estimated_task_cost: input.estimatedTaskCost ?? null,
    actual_task_cost: input.actualTaskCost ?? null,
    task_cost_policy_version: input.taskCostPolicyVersion ?? null,
  });
  if (error) {
    throw new Error(`workflow_runs.recordRun failed: ${error.message}`);
  }
}

export interface ListRunsOptions {
  /** Defaults to 25; capped at 100 to keep UI list pages snappy. */
  limit?: number;
}

/**
 * Atomically claim the notification-fanout slot for a run.
 *
 * Returns true if THIS call won the claim (caller proceeds to fan out
 * notifications). Returns false if the slot was already claimed (caller
 * skips silently — another invocation already fanned out).
 *
 * Race-safe via the WHERE error_notifications_sent_at IS NULL predicate
 * combined with the row's PK lock during UPDATE — concurrent claims
 * collapse to one winner. Service-role: this runs from background
 * execution (engine.persistRun) with no user session.
 *
 * Per V2 notifications platform plan §3 (Dedup strategy).
 */
export async function claimNotificationFanout(runId: string): Promise<boolean> {
  const supabase = getServiceRoleClient(
    `notifications: claimNotificationFanout ${runId}`,
  );
  const { data, error } = await supabase
    .from("workflow_runs")
    .update({ error_notifications_sent_at: new Date().toISOString() })
    .eq("id", runId)
    .is("error_notifications_sent_at", null)
    .select("id");
  if (error) {
    throw new Error(`workflow_runs.claimNotificationFanout failed: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Fetch a single run by id. Returns null when the row does not exist or
 * RLS hides it from the current user. Used by the detail endpoint in
 * Slice 3.8 (test-run output preview); the list endpoint stays
 * `listByWorkflow` for cheap pagination.
 *
 * Reads via the SSR-cookie client so RLS gates per-user access — a
 * runId that belongs to another user surfaces as `null`, not a leak.
 */
export async function getById(runId: string): Promise<WorkflowRunRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    throw new Error(`workflow_runs.getById failed: ${error.message}`);
  }
  if (!data) return null;
  return rowToRecord(data as WorkflowRunsRow);
}

export async function listByWorkflow(
  workflowId: string,
  opts: ListRunsOptions = {},
): Promise<readonly WorkflowRunRecord[]> {
  const supabase = await createClient();
  const limit = Math.min(opts.limit ?? 25, 100);
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`workflow_runs.listByWorkflow failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as WorkflowRunsRow));
}
