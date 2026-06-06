import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  WorkflowRunErrorClassification,
  WorkflowRunFatalError,
  WorkflowRunStatus,
  WorkflowRunStep,
  WorkflowRunTriggeredBy,
} from "./workflowRuns";

/**
 * Pre-run row lifecycle helpers + billing projection + stale-run sweep.
 *
 * Extracted from `repositories/workflowRuns.ts` (max-lines lint cleanup,
 * AI-28 follow-up). All write paths use service-role — these run from the
 * engine + cron with no user session.
 *
 * Split rationale: this file owns the COST-15B pre-run row lifecycle
 * (create-at-start → finalize-by-UPDATE) + the COST-15F stale-run sweep
 * + the billing-facing read projection. The sibling `workflowRuns.ts`
 * keeps the display-facing record types + the legacy finalize-only
 * `recordRun` / `listByWorkflow` / `getById` path. Callers that use
 * `import * as workflowRunsRepo from "@/repositories/workflowRuns"` see
 * the same surface — `workflowRuns.ts` re-exports everything below via
 * a single `export * from "./workflowRunsLifecycle"`.
 *
 * Type scoping: `WorkflowRunLifecycleStatus` (running / succeeded / failed)
 * lives here, separate from the display `WorkflowRunStatus` (succeeded /
 * failed). Widening the display type would ripple into the API contract
 * + UI; the engine + billing layers consume the lifecycle type here.
 */

// ── Pre-run row lifecycle (Slice 4.COST-15B) ─────────────────────────────────
//
// Foundation for creating a workflow_runs row at the START of execution and
// finalizing it by UPDATE — the prerequisite for live reserve/reconcile billing
// (the COST-12 RPCs key on workflow_runs.id and return 'run_not_found' without a
// row). See docs/slices/phase-4/pre-run-workflow-run-lifecycle-design.md.

/** Run lifecycle state, including the non-terminal pre-run state. */
export type WorkflowRunLifecycleStatus = "running" | "succeeded" | "failed";

/** billing_status values the COST-12 reserve/reconcile RPCs set on the row. */
export type WorkflowRunBillingStatus =
  | "reserved"
  | "reconciled"
  | "released"
  | "failed"
  | null;

export interface CreateWorkflowRunStartInput {
  /** Engine-assigned run id (also the row's PK). */
  runId: string;
  workflowId: string;
  /** Owning account (from workflow.account_id) — 4.ACCOUNT-MODEL-8. */
  accountId: string;
  /** Actor: caller userId for manual/retry; NULL for webhook/polling/cron/scheduled/system. */
  triggeredByUserId: string | null;
  triggerNodeId: string;
  triggerEvent: TriggerEvent;
  startedAt: string;
  isTest: boolean;
  triggeredBy: WorkflowRunTriggeredBy;
  /**
   * RH-2 — public API-key provenance. Optional; default NULL for every non-API-key
   * run. The id is a nullable FK to account_api_keys; the prefix is a non-secret
   * snapshot. Never the raw key/hash.
   */
  triggeredByApiKeyId?: string | null;
  triggeredByApiKeyPrefix?: string | null;
  /** COST-2 estimate, known pre-execution. Optional. */
  estimatedTaskCost?: number | null;
  taskCostPolicyVersion?: string | null;
}

export interface CreateWorkflowRunStartResult {
  /** false ⇒ a row already existed for this runId (duplicate dispatch). */
  created: boolean;
}

/**
 * INSERT a minimal pre-run row in the non-terminal 'running' state
 * (finished_at NULL, billing_status NULL). Idempotent on the runId PK: a
 * duplicate insert (replayed dispatch) returns `{created:false}` WITHOUT
 * throwing and WITHOUT overwriting the existing row — a stronger safety
 * property than today's finalize-only INSERT (which double-executes then
 * silently fails the second insert). Any other DB error still throws.
 */
export async function createWorkflowRunStart(
  input: CreateWorkflowRunStartInput,
): Promise<CreateWorkflowRunStartResult> {
  const supabase = getServiceRoleClient(
    `engine: createWorkflowRunStart ${input.runId} (workflow ${input.workflowId})`,
  );
  const { error } = await supabase.from("workflow_runs").insert({
    id: input.runId,
    workflow_id: input.workflowId,
    account_id: input.accountId,
    triggered_by_user_id: input.triggeredByUserId,
    status: "running",
    trigger_node_id: input.triggerNodeId,
    trigger_event: input.triggerEvent,
    steps: [],
    started_at: input.startedAt,
    finished_at: null,
    is_test: input.isTest,
    triggered_by: input.triggeredBy,
    triggered_by_api_key_id: input.triggeredByApiKeyId ?? null,
    triggered_by_api_key_prefix: input.triggeredByApiKeyPrefix ?? null,
    estimated_task_cost: input.estimatedTaskCost ?? null,
    actual_task_cost: null,
    task_cost_policy_version: input.taskCostPolicyVersion ?? null,
    // billing_status intentionally left NULL — no reservation at create time.
  });
  if (error) {
    // 23505 = unique_violation (PK conflict) → duplicate-dispatch guard.
    if (error.code === "23505") return { created: false };
    throw new Error(`workflow_runs.createWorkflowRunStart failed: ${error.message}`);
  }
  return { created: true };
}

export interface FinalizeWorkflowRunInput {
  runId: string;
  /** Terminal status only — finalize never sets 'running'. */
  status: WorkflowRunStatus;
  steps: readonly WorkflowRunStep[];
  fatalError?: WorkflowRunFatalError | null;
  errorClassification?: WorkflowRunErrorClassification | null;
  finishedAt: string;
  /** COST-3 cost columns; only written when provided. */
  estimatedTaskCost?: number | null;
  actualTaskCost?: number | null;
  taskCostPolicyVersion?: string | null;
}

export interface FinalizeWorkflowRunResult {
  /** false ⇒ no matching row (caller decides: error / fallback insert). */
  finalized: boolean;
}

/**
 * UPDATE an existing (pre-run) row to its terminal outcome. Does NOT touch
 * billing_status / reserved_task_cost / reconciled_task_cost / reservation_* —
 * those are owned exclusively by the COST-12 reserve/reconcile RPCs, so finalize
 * preserves any reservation lifecycle state the RPCs set.
 *
 * Chosen no-row behavior: returns `{finalized:false}` (NOT an insert fallback).
 * finalize is paired with createWorkflowRunStart; a missing row signals a logic
 * error, and recordRun remains the finalize-only INSERT path for callers that
 * have not adopted create-at-start yet (COST-15C wires the engine). This keeps
 * finalize a pure UPDATE and avoids masking bugs by silently creating rows.
 */
export async function finalizeWorkflowRun(
  input: FinalizeWorkflowRunInput,
): Promise<FinalizeWorkflowRunResult> {
  const supabase = getServiceRoleClient(
    `engine: finalizeWorkflowRun ${input.runId}`,
  );
  const update: Record<string, unknown> = {
    status: input.status,
    steps: input.steps as readonly WorkflowRunStep[],
    fatal_error: input.fatalError ?? null,
    error_classification: input.errorClassification ?? null,
    finished_at: input.finishedAt,
  };
  // Only overwrite cost columns when supplied (undefined ⇒ leave untouched).
  if (input.estimatedTaskCost !== undefined) {
    update.estimated_task_cost = input.estimatedTaskCost;
  }
  if (input.actualTaskCost !== undefined) {
    update.actual_task_cost = input.actualTaskCost;
  }
  if (input.taskCostPolicyVersion !== undefined) {
    update.task_cost_policy_version = input.taskCostPolicyVersion;
  }
  const { data, error } = await supabase
    .from("workflow_runs")
    .update(update)
    .eq("id", input.runId)
    .select("id");
  if (error) {
    throw new Error(`workflow_runs.finalizeWorkflowRun failed: ${error.message}`);
  }
  return { finalized: (data?.length ?? 0) > 0 };
}

export interface MarkWorkflowRunFailedBeforeExecutionInput {
  runId: string;
  fatalError: WorkflowRunFatalError;
  errorClassification?: WorkflowRunErrorClassification | null;
  finishedAt: string;
}

export interface MarkWorkflowRunFailedBeforeExecutionResult {
  updated: boolean;
}

/**
 * UPDATE a pre-run row to terminal 'failed' for a fatal that occurs AFTER the
 * row exists but BEFORE/at the billing reservation (e.g. BILLING_EXHAUSTED).
 * Does NOT mutate billing_status — reservation-state transitions remain owned by
 * the reserve/reconcile RPCs (the reserve RPC itself stamps 'failed' on
 * insufficient capacity). Returns `{updated:false}` if no row matched.
 */
export async function markWorkflowRunFailedBeforeExecution(
  input: MarkWorkflowRunFailedBeforeExecutionInput,
): Promise<MarkWorkflowRunFailedBeforeExecutionResult> {
  const supabase = getServiceRoleClient(
    `engine: markWorkflowRunFailedBeforeExecution ${input.runId}`,
  );
  const { data, error } = await supabase
    .from("workflow_runs")
    .update({
      status: "failed",
      fatal_error: input.fatalError,
      error_classification: input.errorClassification ?? null,
      finished_at: input.finishedAt,
    })
    .eq("id", input.runId)
    .select("id");
  if (error) {
    throw new Error(
      `workflow_runs.markWorkflowRunFailedBeforeExecution failed: ${error.message}`,
    );
  }
  return { updated: (data?.length ?? 0) > 0 };
}

/**
 * Billing-facing projection of a run row. Carries only ids / status / cost /
 * reservation columns — never trigger_event, steps, or any config payload, so
 * no secrets reach a billing caller.
 */
export interface WorkflowRunBillingRecord {
  id: string;
  /**
   * 4.ACCOUNT-MODEL-8: was `userId` (workflow_runs.user_id, now dropped). The
   * run row carries account_id; the billing projection exposes it for the
   * future Phase-C settlement layer (which re-keys billing to the account).
   * Phase B billing still keys on the workflow's createdByUserId at the gate;
   * this projection has no production callers yet.
   */
  accountId: string;
  workflowId: string;
  status: WorkflowRunLifecycleStatus;
  isTest: boolean;
  billingStatus: WorkflowRunBillingStatus;
  reservedTaskCost: number | null;
  reconciledTaskCost: number | null;
  estimatedTaskCost: number | null;
  actualTaskCost: number | null;
  reservationId: string | null;
  reservationExpiresAt: string | null;
  billingReconciledAt: string | null;
  finishedAt: string | null;
}

interface WorkflowRunBillingRow {
  id: string;
  account_id: string;
  workflow_id: string;
  status: WorkflowRunLifecycleStatus;
  is_test: boolean;
  billing_status: WorkflowRunBillingStatus;
  reserved_task_cost: number | null;
  reconciled_task_cost: number | null;
  estimated_task_cost: number | null;
  actual_task_cost: number | null;
  reservation_id: string | null;
  reservation_expires_at: string | null;
  billing_reconciled_at: string | null;
  finished_at: string | null;
}

/**
 * Read a run's billing/lifecycle projection (service-role). For the future
 * engine/settlement layer (COST-15C/D) + tests. Returns null when the row is
 * absent. Selects only billing-relevant columns — no payloads / secrets.
 */
export async function getWorkflowRunForBilling(
  runId: string,
): Promise<WorkflowRunBillingRecord | null> {
  const supabase = getServiceRoleClient(
    `billing: getWorkflowRunForBilling ${runId}`,
  );
  const { data, error } = await supabase
    .from("workflow_runs")
    .select(
      "id, account_id, workflow_id, status, is_test, billing_status, reserved_task_cost, reconciled_task_cost, estimated_task_cost, actual_task_cost, reservation_id, reservation_expires_at, billing_reconciled_at, finished_at",
    )
    .eq("id", runId)
    .maybeSingle<WorkflowRunBillingRow>();
  if (error) {
    throw new Error(`workflow_runs.getWorkflowRunForBilling failed: ${error.message}`);
  }
  if (!data) return null;
  return {
    id: data.id,
    accountId: data.account_id,
    workflowId: data.workflow_id,
    status: data.status,
    isTest: data.is_test,
    billingStatus: data.billing_status,
    reservedTaskCost: data.reserved_task_cost,
    reconciledTaskCost: data.reconciled_task_cost,
    estimatedTaskCost: data.estimated_task_cost,
    actualTaskCost: data.actual_task_cost,
    reservationId: data.reservation_id,
    reservationExpiresAt: data.reservation_expires_at,
    billingReconciledAt: data.billing_reconciled_at,
    finishedAt: data.finished_at,
  };
}

// ── Stale 'running' run sweep (Slice 4.COST-15F) ─────────────────────────────
//
// Crash recovery for the COST-15C lifecycle: a process that dies between
// createWorkflowRunStart and finalize leaves a row stuck in status='running'
// (hidden from the UI by the running-row read filter). This marks such rows
// failed after a staleness cutoff so they finalize like any other failed run.
//
// SEPARATE from the COST-12 release_expired_reservations RPC, which sweeps
// reserved BILLING HOLDS. This sweep is about run-lifecycle state only — it
// NEVER touches billing_status / reserved_task_cost / reconciled_task_cost /
// reservation_id / reservation_expires_at / billing_reconciled_at, never
// deducts/refunds tasks, and writes no task_usage_events.

export interface SweepStaleRunningWorkflowRunsInput {
  /** ISO timestamp; rows with `started_at` strictly before this are stale. */
  cutoff: string;
  /** Failure payload written to the swept rows (built by the sweep service). */
  fatalError: WorkflowRunFatalError;
  errorClassification: WorkflowRunErrorClassification;
  finishedAt: string;
  /** Optional batch cap. Omitted ⇒ sweep all matching rows in one UPDATE. */
  limit?: number;
}

export interface SweepStaleRunningWorkflowRunsResult {
  sweptCount: number;
  runIds: string[];
  cutoff: string;
}

/**
 * Mark stale 'running' rows (started before `cutoff`, no finish time) as failed.
 * Idempotent: the predicate (`status='running' AND finished_at IS NULL`) no
 * longer matches a row once it is swept, so re-running finds nothing. Terminal
 * (succeeded/failed) rows and not-yet-stale running rows are never touched.
 *
 * `limit` is honored via a pre-select of the oldest matching ids, then an UPDATE
 * scoped to those ids that RE-APPLIES the full predicate (race-safe: a row
 * finalized between the select and update is excluded).
 */
export async function sweepStaleRunningWorkflowRuns(
  input: SweepStaleRunningWorkflowRunsInput,
): Promise<SweepStaleRunningWorkflowRunsResult> {
  const supabase = getServiceRoleClient(
    `cron: sweepStaleRunningWorkflowRuns (cutoff ${input.cutoff})`,
  );

  let limitIds: string[] | null = null;
  if (input.limit !== undefined) {
    const sel = await supabase
      .from("workflow_runs")
      .select("id")
      .eq("status", "running")
      .is("finished_at", null)
      .lt("started_at", input.cutoff)
      .order("started_at", { ascending: true })
      .limit(input.limit);
    if (sel.error) {
      throw new Error(
        `workflow_runs.sweepStaleRunningWorkflowRuns (select) failed: ${sel.error.message}`,
      );
    }
    limitIds = (sel.data ?? []).map((r) => (r as { id: string }).id);
    if (limitIds.length === 0) {
      return { sweptCount: 0, runIds: [], cutoff: input.cutoff };
    }
  }

  let query = supabase
    .from("workflow_runs")
    .update({
      status: "failed",
      finished_at: input.finishedAt,
      fatal_error: input.fatalError,
      error_classification: input.errorClassification,
      // NOTE: no billing_status / reserved_task_cost / reconciled_task_cost /
      // reservation_* / billing_reconciled_at — billing state is left intact.
    })
    .eq("status", "running")
    .is("finished_at", null)
    .lt("started_at", input.cutoff);
  if (limitIds !== null) {
    query = query.in("id", limitIds);
  }
  const { data, error } = await query.select("id");
  if (error) {
    throw new Error(
      `workflow_runs.sweepStaleRunningWorkflowRuns failed: ${error.message}`,
    );
  }
  const runIds = (data ?? []).map((r) => (r as { id: string }).id);
  return { sweptCount: runIds.length, runIds, cutoff: input.cutoff };
}
