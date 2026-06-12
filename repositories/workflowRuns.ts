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
 * in `supabase/migrations/20260523000000_workflow_runs_test_mode.sql`
 * (expanded with `api_key` in `20260609000000_workflow_runs_api_key_source.sql`).
 * Adding a new source = migration + this union edit.
 */
export type WorkflowRunTriggeredBy =
  | "manual"
  | "test"
  | "webhook"
  | "scheduled"
  | "retry"
  | "api_key"
  | "unknown";

export interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  /**
   * V2 account that owns this run — equals the owning workflow's account_id
   * (4.ACCOUNT-MODEL-8 cutover). NOT NULL per the foundation. Authorization is
   * by account membership (RLS); this field is the owner key.
   */
  accountId: string;
  /**
   * Actor provenance — the human who manually ran / retried this run. NULL for
   * webhook / polling / cron / scheduled / system runs (no human caller). NOT
   * authorization.
   */
  triggeredByUserId: string | null;
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
  /**
   * RH-2 — public API-key provenance. Both NULL for every non-API-key run. The
   * id is a (nullable) FK to account_api_keys; the prefix is a NON-SECRET snapshot
   * that survives the key being revoked/renamed/deleted. Never the raw key/hash.
   */
  triggeredByApiKeyId: string | null;
  triggeredByApiKeyPrefix: string | null;
}

interface WorkflowRunsRow {
  id: string;
  workflow_id: string;
  account_id: string;
  triggered_by_user_id: string | null;
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
  triggered_by_api_key_id: string | null;
  triggered_by_api_key_prefix: string | null;
}

function rowToRecord(row: WorkflowRunsRow): WorkflowRunRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    accountId: row.account_id,
    triggeredByUserId: row.triggered_by_user_id,
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
    triggeredByApiKeyId: row.triggered_by_api_key_id,
    triggeredByApiKeyPrefix: row.triggered_by_api_key_prefix,
  };
}

export interface RecordRunInput {
  /** Engine-assigned run id (also the row's id). */
  runId: string;
  workflowId: string;
  /** Owning account (from workflow.account_id) — 4.ACCOUNT-MODEL-8. */
  accountId: string;
  /** Actor: caller userId for manual/retry; NULL for webhook/polling/cron/scheduled. */
  triggeredByUserId: string | null;
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
   * RH-2 — public API-key provenance. Optional; default NULL for every non-API-key
   * run (manual/test/webhook/scheduled/retry). The id is a nullable FK to
   * account_api_keys; the prefix is a non-secret snapshot. Never the raw key/hash.
   */
  triggeredByApiKeyId?: string | null;
  triggeredByApiKeyPrefix?: string | null;
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
    account_id: input.accountId,
    triggered_by_user_id: input.triggeredByUserId,
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
    triggered_by_api_key_id: input.triggeredByApiKeyId ?? null,
    triggered_by_api_key_prefix: input.triggeredByApiKeyPrefix ?? null,
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
    // COST-15C — hide in-progress (pre-run/crashed) rows from the UI detail
    // surface. The display contract (WorkflowRunSummarySchema) is terminal-only
    // (succeeded/failed); a 'running' row would fail response validation. An
    // in-progress run reads as "not yet available" (null) until it finalizes.
    .neq("status", "running")
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
    // COST-15C — exclude in-progress (pre-run/crashed) rows from the run-history
    // list. The display contract is terminal-only (succeeded/failed); the UI
    // surfaces a run only once it finalizes, preserving pre-COST-15C UX.
    .neq("status", "running")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`workflow_runs.listByWorkflow failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as WorkflowRunsRow));
}

/**
 * Display-safe per-account run-history projection (Slice 4.RUNS-PAGE-1;
 * account-scoped in 4.ACCOUNT-MODEL-8).
 *
 * Returned shape is strictly narrower than {@link WorkflowRunRecord} —
 * the SELECT enumerates only columns the run-history page renders:
 *   id / workflow_id / status / is_test / triggered_by / started_at /
 *   finished_at / error_classification.
 *
 * Deliberately omitted:
 *   - `account_id` / `triggered_by_user_id` — ownership / actor scope; the
 *     UI doesn't render them and they'd re-leak auth scope.
 *   - `trigger_event` — raw upstream payload (webhook bodies, schedule
 *     metadata, manual run inputs); can contain secrets / PII.
 *   - `steps` — per-step output blobs; can contain secrets / PII.
 *   - `fatal_error` — engine-internal code/message; the humanized
 *     `error_classification` is the user-facing surface.
 *   - All billing columns (`reserved_task_cost`, `actual_task_cost`,
 *     `reservation_*`, `billing_*`) — out of scope.
 *
 * Rows in the non-terminal `running` state are filtered out — the
 * display contract is terminal-only, matching `listByWorkflow`.
 * Test-mode rows are returned by default; the UI hides them behind
 * an opt-in toggle.
 *
 * RLS gates account-member access (SSR-cookie client). The account_id WHERE
 * is defense-in-depth; an attacker who somehow bypasses RLS still cannot
 * read another account's rows through this method.
 */
export interface WorkflowRunDisplayRecord {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  isTest: boolean;
  triggeredBy: WorkflowRunTriggeredBy;
  /**
   * RH-3 — non-secret API-key prefix snapshot for `api_key` runs (null otherwise).
   * Display-only attribution; never the raw key or hash.
   */
  triggeredByApiKeyPrefix: string | null;
  startedAt: string;
  finishedAt: string | null;
  errorClassification: WorkflowRunErrorClassification | null;
}

interface WorkflowRunDisplayRow {
  id: string;
  workflow_id: string;
  status: WorkflowRunStatus;
  is_test: boolean;
  triggered_by: WorkflowRunTriggeredBy;
  triggered_by_api_key_prefix: string | null;
  started_at: string;
  finished_at: string | null;
  error_classification: WorkflowRunErrorClassification | null;
}

const DISPLAY_RUN_COLUMNS =
  "id,workflow_id,status,is_test,triggered_by,triggered_by_api_key_prefix,started_at,finished_at,error_classification";

export interface ListRunsForDisplayOptions {
  /** Defaults to 50, capped at 200 to keep the list-page render bounded. */
  limit?: number;
}

export async function listByAccountForDisplay(
  accountId: string,
  opts: ListRunsForDisplayOptions = {},
): Promise<readonly WorkflowRunDisplayRecord[]> {
  const supabase = await createClient();
  const limit = Math.min(opts.limit ?? 50, 200);
  const { data, error } = await supabase
    .from("workflow_runs")
    .select(DISPLAY_RUN_COLUMNS)
    .eq("account_id", accountId)
    .neq("status", "running")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`workflow_runs.listByAccountForDisplay failed: ${error.message}`);
  }
  return (data ?? []).map((r) => {
    const row = r as WorkflowRunDisplayRow;
    return {
      id: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      isTest: row.is_test,
      triggeredBy: row.triggered_by,
      triggeredByApiKeyPrefix: row.triggered_by_api_key_prefix,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      errorClassification: row.error_classification,
    };
  });
}

// ── Pre-run lifecycle / billing projection / stale sweep ─────────────────────
//
// Extracted to `workflowRunsLifecycle.ts` (AI-28 follow-up, max-lines lint
// cleanup) for file-size hygiene. The re-export below preserves the existing
// `import * as workflowRunsRepo from "@/repositories/workflowRuns"` API for
// every consumer (engine, sweep service, route handlers, tests) — no caller
// needs to change its import.
export * from "./workflowRunsLifecycle";

// ── Diagnostics readers (service-role, sessionless, INCLUDE running) ──────────
//
// Sessionless service-role run readers for the internal diagnostics surface
// (4.MCP-STAGE-2B-3). Kept in a sibling for file-size hygiene + because they
// return a WIDENED status type (`running`) the terminal-only display path must
// not see. NON-authorizing — the diagnostics route gates + checks membership.
export * from "./workflowRunsDiagnostics";
