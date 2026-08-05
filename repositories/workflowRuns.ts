import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type { TriggerEvent } from "@/contracts/triggerEvent";
// RUN-VISIBILITY-1 — the display readers now return non-terminal rows, so the
// read record/row types carry the 4-value lifecycle status (queued/running/
// succeeded/failed). Terminal-only write/input types keep `WorkflowRunStatus`.
import type { WorkflowRunLifecycleStatus } from "./workflowRunsLifecycle";
import { asTypedDb } from "./supabase/typedDb";
import type { TableRow } from "@/types/tables";
import { toJsonColumn } from "@/core/database/jsonColumn";
import { narrowColumn } from "@/core/database/columnNarrowing";
import {
  WORKFLOW_RUN_TRIGGERED_BY,
  parseErrorClassification,
  parseFatalError,
  parseRunSteps,
  parseTriggerEvent,
} from "@/core/database/workflowRunColumns";

/**
 * Repository for workflow_runs.
 *
 * Engine path (recordRun / createWorkflowRunStart / finalize) writes via
 * service-role — runs persist in the background after a webhook returns 200,
 * with no user session.
 *
 * UI path (getById / listByWorkflow / listByAccountForDisplay) ALSO reads via
 * service-role as of V2-READY-51: `authenticated` no longer holds a direct
 * Data API SELECT on `workflow_runs` (the grant was revoked so a member can't
 * `db.from('workflow_runs').select('trigger_event, steps, fatal_error')`
 * directly via PostgREST). These readers are therefore NON-AUTHORIZING — they
 * bypass RLS. Every caller MUST gate access itself before returning anything to
 * a client: the run-history routes resolve the caller's own account; the
 * builder run-list / run-detail routes authorize the caller as a member of the
 * workflow's account (`loadWorkflowForMember` / `requireWorkflowAccountMember`).
 * The route DTOs (`toWorkflowRunSummary` / `toWorkflowRunDetail` /
 * `toRunListItem`) sanitize the payload columns; the raw record never leaves
 * the app.
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
  // CR-FAILREASON-1 — kept in lockstep with `HumanizedError`
  // (core/errors/humanizeActionError.ts) and `HumanizedErrorSchema`
  // (contracts/workflow.ts). Extended from the original 3 with `retry_later`,
  // `contact_support`, and `review_pending` (CS-4 — a connected app changed and
  // ChainReact is reviewing it). Persisted as JSONB, so existing rows (earlier
  // values / none) still satisfy this widened type — no migration needed.
  // CS-6 added `link_vehicles`. Persisted as JSONB, so existing rows (earlier
  // values / none) still satisfy this widened type — no migration needed.
  action?:
    | "reconnect"
    | "open_node"
    | "retry_later"
    | "upgrade_plan"
    | "review_pending"
    | "link_vehicles"
    | "contact_support";
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

// SUPABASE-TABLE-TYPING-1B — the row shape is the GENERATED one. `status` is a
// real Postgres enum so the generator already types it exactly; the four jsonb
// columns and the two CHECK-constrained text columns are parsed/narrowed here
// rather than asserted, so a malformed stored run fails closed instead of being
// replayed by the engine.
function rowToRecord(row: TableRow<"workflow_runs">): WorkflowRunRecord {
  // Both readers filter `.neq(status,'running').neq(status,'queued')`, so this
  // record is TERMINAL by construction — but a `.neq()` filter cannot narrow a
  // type, and the record's contract (terminal status + non-null finishedAt)
  // would otherwise be an unchecked assumption. Assert the invariant instead:
  // a non-terminal row here means a query lost its filter, and must fail rather
  // than be mislabelled as a finished run.
  if (row.status !== "succeeded" && row.status !== "failed") {
    throw new Error(
      `workflow_runs(${row.id}): expected a terminal run, got status "${row.status}"`,
    );
  }
  if (row.finished_at === null) {
    throw new Error(`workflow_runs(${row.id}): terminal run has no finished_at`);
  }
  return {
    id: row.id,
    workflowId: row.workflow_id,
    accountId: row.account_id,
    triggeredByUserId: row.triggered_by_user_id,
    status: row.status,
    triggerNodeId: row.trigger_node_id,
    triggerEvent: parseTriggerEvent(`workflow_runs.trigger_event(${row.id})`, row.trigger_event),
    steps: parseRunSteps(`workflow_runs.steps(${row.id})`, row.steps),
    fatalError: parseFatalError(`workflow_runs.fatal_error(${row.id})`, row.fatal_error),
    errorClassification: parseErrorClassification(
      `workflow_runs.error_classification(${row.id})`,
      row.error_classification,
    ),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    isTest: row.is_test,
    triggeredBy: narrowColumn(
      "workflow_runs.triggered_by",
      WORKFLOW_RUN_TRIGGERED_BY,
      row.triggered_by,
    ),
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
  const db = asTypedDb(supabase);
  const { error } = await db.from("workflow_runs").insert({
    id: input.runId,
    workflow_id: input.workflowId,
    account_id: input.accountId,
    triggered_by_user_id: input.triggeredByUserId,
    status: input.status,
    trigger_node_id: input.triggerNodeId,
    trigger_event: toJsonColumn("workflow_runs.trigger_event", input.triggerEvent),
    steps: toJsonColumn("workflow_runs.steps", input.steps),
    fatal_error: toJsonColumn("workflow_runs.fatal_error", input.fatalError ?? null),
    error_classification: toJsonColumn(
      "workflow_runs.error_classification",
      input.errorClassification ?? null,
    ),
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
  const db = asTypedDb(supabase);
  const { data, error } = await db
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
 * Fetch a single run by id. Returns null when the row does not exist.
 * Used by the builder run-detail endpoint (Slice 3.8 test-run output preview);
 * the list endpoint stays `listByWorkflow` for cheap pagination.
 *
 * V2-READY-51: reads via SERVICE-ROLE (the authenticated SELECT grant was
 * revoked). NON-AUTHORIZING — the detail route MUST authorize the caller as a
 * member of `record.accountId` before returning, and cross-validate the run's
 * `workflowId` against the route's `[id]`. Returns the full record (incl.
 * `steps` / `triggerEvent` / `fatalError`) for the route's DTO mapper to
 * sanitize; the raw record never reaches a client.
 */
export async function getById(runId: string): Promise<WorkflowRunRecord | null> {
  const supabase = getServiceRoleClient(`runs: getById ${runId}`);
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("workflow_runs")
    .select("*")
    // COST-15C — hide in-progress (pre-run/crashed) rows from the UI detail
    // surface. The display contract (WorkflowRunSummarySchema) is terminal-only
    // (succeeded/failed); a 'running' row would fail response validation. An
    // in-progress run reads as "not yet available" (null) until it finalizes.
    // Terminal-only: the run-detail surface (builder Runs tab + poll) consumes
    // the terminal WorkflowRunSummary/Detail contract. A non-terminal run reads
    // as "not yet available" (the poll's 404-while-pending path); RUN-VISIBILITY-1
    // surfaces in-flight runs on the account /runs page instead.
    .neq("status", "running")
    .neq("status", "queued")
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    throw new Error(`workflow_runs.getById failed: ${error.message}`);
  }
  if (!data) return null;
  return rowToRecord(data);
}

/**
 * List a workflow's recent runs (terminal only), newest first. Used by the
 * builder run-list endpoint.
 *
 * V2-READY-51: reads via SERVICE-ROLE (the authenticated SELECT grant was
 * revoked). NON-AUTHORIZING — the run-list route MUST authorize the caller as a
 * member of the workflow's account (`loadWorkflowForMember`) before calling
 * this. The route maps each record through `toWorkflowRunSummary`, which strips
 * `steps` / `triggerEvent` / `fatalError`.
 */
export async function listByWorkflow(
  workflowId: string,
  opts: ListRunsOptions = {},
): Promise<readonly WorkflowRunRecord[]> {
  const supabase = getServiceRoleClient(`runs: listByWorkflow ${workflowId}`);
  const db = asTypedDb(supabase);
  const limit = Math.min(opts.limit ?? 25, 100);
  const { data, error } = await db
    .from("workflow_runs")
    .select("*")
    .eq("workflow_id", workflowId)
    // Terminal-only — the builder Runs tab shows finalized history; the live
    // in-flight run is covered by the synthetic runSlice poll row. (RUN-VISIBILITY-1
    // surfaces non-terminal runs on the account /runs page, not here.)
    .neq("status", "running")
    .neq("status", "queued")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`workflow_runs.listByWorkflow failed: ${error.message}`);
  }
  return (data ?? []).map(rowToRecord);
}

/**
 * 5.ONBOARD-1 — does this workflow have at least one SUCCEEDED run (test or
 * live)? Narrow existence probe for the onboarding "confirm a successful run"
 * step: `status = 'succeeded'` only — failed/running/queued rows never count.
 * NON-AUTHORIZING (service-role): callers must have membership-gated the
 * workflow's account upstream. Selects `id` only — no payload columns.
 */
export async function hasSucceededRunServiceRole(
  workflowId: string,
): Promise<boolean> {
  const supabase = getServiceRoleClient(
    `onboarding: hasSucceededRun ${workflowId}`,
  );
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("workflow_runs")
    .select("id")
    .eq("workflow_id", workflowId)
    .eq("status", "succeeded")
    .limit(1);
  if (error) {
    throw new Error(
      `workflow_runs.hasSucceededRunServiceRole failed: ${error.message}`,
    );
  }
  return (data ?? []).length > 0;
}

/**
 * 5.ONBOARD-4 — has THIS user personally driven a successful run in THIS account?
 *
 * Evidence for the member checklist's "use a team workflow" step. Deliberately
 * stricter than {@link hasSucceededRunServiceRole}: it additionally requires
 * `triggered_by_user_id = userId`, which is non-null only for a manual run or
 * retry a human actually started (webhook / polling / cron / schedule runs leave
 * it NULL — see WorkflowRunRecord.triggeredByUserId). So a member cannot complete
 * this step by watching someone else's automation fire; they must have run or
 * tested a team workflow themselves.
 *
 * Test-mode runs count on purpose — the step teaches "you are allowed to run team
 * workflows", and an in-builder test proves exactly that. Members ARE authorized
 * to run (app/api/workflows/_shared.ts: workflow access is membership-only, not
 * role-gated), so this step never asks for something the member cannot do.
 *
 * NON-AUTHORIZING (service-role): callers must have membership-gated the account
 * upstream. Selects `id` only — no payload columns.
 */
export async function hasSucceededRunByUserInAccountServiceRole(input: {
  accountId: string;
  userId: string;
}): Promise<boolean> {
  const supabase = getServiceRoleClient(
    `collabOnboarding: hasSucceededRunByUser ${input.accountId}`,
  );
  const db = asTypedDb(supabase);
  const { data, error } = await db
    .from("workflow_runs")
    .select("id")
    .eq("account_id", input.accountId)
    .eq("triggered_by_user_id", input.userId)
    .eq("status", "succeeded")
    .limit(1);
  if (error) {
    throw new Error(
      `workflow_runs.hasSucceededRunByUserInAccountServiceRole failed: ${error.message}`,
    );
  }
  return (data ?? []).length > 0;
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
 * V2-READY-51: reads via SERVICE-ROLE (the authenticated SELECT grant was
 * revoked). NON-AUTHORIZING — the `account_id` is supplied by the caller, which
 * resolves it from the CALLER'S OWN session (`/api/runs` + the `/runs` page use
 * `ensurePersonalAccount` / `resolveActiveAccount`, both of which reject an
 * account the caller is not a member of). The hard `eq('account_id', accountId)`
 * predicate scopes the read to that one account. The SELECT is already narrowed
 * to the safe `DISPLAY_RUN_COLUMNS` (no `trigger_event` / `steps` / `fatal_error`).
 */
export interface WorkflowRunDisplayRecord {
  id: string;
  workflowId: string;
  status: WorkflowRunLifecycleStatus;
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
  const supabase = getServiceRoleClient(
    `runs: listByAccountForDisplay account ${accountId}`,
  );
  const db = asTypedDb(supabase);
  const limit = Math.min(opts.limit ?? 50, 200);
  const { data, error } = await db
    .from("workflow_runs")
    .select(DISPLAY_RUN_COLUMNS)
    .eq("account_id", accountId)
    // RUN-VISIBILITY-1 — include queued/running rows so a just-started run is
    // visible on the /runs page instead of appearing only once it finalizes.
    // DISPLAY_RUN_COLUMNS already excludes trigger_event/steps/fatal_error; the
    // RunListItem schema accepts the 4-value display status + null finishedAt.
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`workflow_runs.listByAccountForDisplay failed: ${error.message}`);
  }
  // The projection is INFERRED from DISPLAY_RUN_COLUMNS — it is not a full row,
  // and must not be typed as one. Only the broad columns need narrowing.
  return (data ?? []).map((row) => ({
    id: row.id,
    workflowId: row.workflow_id,
    status: row.status,
    isTest: row.is_test,
    triggeredBy: narrowColumn(
      "workflow_runs.triggered_by",
      WORKFLOW_RUN_TRIGGERED_BY,
      row.triggered_by,
    ),
    triggeredByApiKeyPrefix: row.triggered_by_api_key_prefix,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorClassification: parseErrorClassification(
      `workflow_runs.error_classification(${row.id})`,
      row.error_classification,
    ),
  }));
}

// ── Analytics aggregation reader (service-role, windowed, narrow columns) ─────
//
// ANALYTICS-1 — windowed reader for the account analytics overview. Selects ONLY
// the columns the aggregation needs (id / workflow_id / status / started_at /
// finished_at / is_test) for terminal runs in `accountId` since `since`, newest
// first, capped. NON-AUTHORIZING (service-role, bypasses RLS): the caller is the
// analytics service, invoked from the `/analytics` page + `/api/analytics/data`
// AFTER `resolveActiveAccount`/`requireUserWithAccount` resolves the caller's own
// account; the hard `eq('account_id', accountId)` predicate is the scope. No raw
// `trigger_event` / `steps` / `fatal_error` is ever selected, so nothing
// sensitive leaves the DB. `running` rows are excluded (terminal-only, like the
// display reader). The cap bounds in-memory aggregation; when it's hit the
// overview marks `truncated: true`.

export interface AnalyticsRunRow {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  startedAt: string;
  finishedAt: string | null;
  isTest: boolean;
}

export interface ListForAnalyticsOptions {
  /** ISO timestamp lower bound (inclusive) on started_at. */
  since: string;
  /** Hard cap on rows scanned. Defaults to 5000, capped at 20000. */
  limit?: number;
}

export async function listForAnalytics(
  accountId: string,
  opts: ListForAnalyticsOptions,
): Promise<readonly AnalyticsRunRow[]> {
  const supabase = getServiceRoleClient(
    `runs: listForAnalytics account ${accountId}`,
  );
  const db = asTypedDb(supabase);
  const limit = Math.min(opts.limit ?? 5000, 20000);
  const { data, error } = await db
    .from("workflow_runs")
    .select("id,workflow_id,status,started_at,finished_at,is_test")
    .eq("account_id", accountId)
    .neq("status", "running")
    // Slice 6 durable queue — also hide pre-execution 'queued' rows. The
    // display contract is terminal-only (succeeded/failed); a queued row exists
    // only briefly (until the processor claims it) and would fail the UI's
    // terminal-only response schema, exactly like 'running'.
    .neq("status", "queued")
    .gte("started_at", opts.since)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`workflow_runs.listForAnalytics failed: ${error.message}`);
  }
  // Inferred projection — ANALYTICS_RUN_COLUMNS is a partial select, not a row.
  return (data ?? []).map((row) => {
    // Terminal-only by query (.neq running/queued). A `.neq()` filter cannot
    // narrow the enum, so the invariant is asserted rather than assumed.
    if (row.status !== "succeeded" && row.status !== "failed") {
      throw new Error(
        `workflow_runs(${row.id}): analytics expects a terminal run, got status "${row.status}"`,
      );
    }
    return {
      id: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      isTest: row.is_test,
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

// ── Durable run queue (Slice 6.DURABLE-QUEUE-1) ──────────────────────────────
//
// Extracted to `workflowRunsQueue.ts` for file-size hygiene (mirrors the
// lifecycle/diagnostics split). enqueue/claim/dispatch-read/stuck-queued-fail
// helpers for the durable run queue. Same `@/repositories/workflowRuns` surface.
export * from "./workflowRunsQueue";

// ── Diagnostics readers (service-role, sessionless, INCLUDE running) ──────────
//
// Sessionless service-role run readers for the internal diagnostics surface
// (4.MCP-STAGE-2B-3). Kept in a sibling for file-size hygiene + because they
// return a WIDENED status type (`running`) the terminal-only display path must
// not see. NON-authorizing — the diagnostics route gates + checks membership.
export * from "./workflowRunsDiagnostics";
