import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  WorkflowRunErrorClassification,
  WorkflowRunFatalError,
  WorkflowRunTriggeredBy,
} from "./workflowRuns";

/**
 * Durable run queue (Slice 6.DURABLE-QUEUE-1).
 *
 * Extracted from `workflowRunsLifecycle.ts` for file-size hygiene (mirrors the
 * existing `workflowRunsLifecycle` / `workflowRunsDiagnostics` split). Re-exported
 * via `workflowRuns.ts` so every consumer keeps importing from
 * `@/repositories/workflowRuns`.
 *
 * enqueueRun persists a run row in the non-terminal 'queued' state BEFORE
 * returning, so the run survives a serverless/request termination (a committed
 * row, not an in-flight promise). The processor (cron + best-effort inline drain)
 * atomically transitions queued -> running via `claimQueuedWorkflowRun` (a
 * status-guarded UPDATE: single winner, no double execution) and hands the row to
 * the engine. The trigger_event stays on this row (its designed home); no
 * separate queue table copies the raw provider payload.
 */

export interface CreateQueuedWorkflowRunInput {
  runId: string;
  workflowId: string;
  accountId: string;
  triggeredByUserId: string | null;
  triggerNodeId: string;
  triggerEvent: TriggerEvent;
  /** ISO time the run was enqueued. Placeholder `started_at`; the claim resets it. */
  enqueuedAt: string;
  isTest: boolean;
  triggeredBy: WorkflowRunTriggeredBy;
  triggeredByApiKeyId?: string | null;
  triggeredByApiKeyPrefix?: string | null;
}

export interface CreateQueuedWorkflowRunResult {
  /** false ⇒ a row already existed for this runId (idempotent re-enqueue). */
  created: boolean;
}

/**
 * INSERT a durable 'queued' run row. Carries every provenance column the engine
 * would otherwise stamp at create-time; `revision_id` stays NULL until the
 * claim stamps the resolved revision; `started_at` is a NOT-NULL placeholder
 * (the enqueue time) that the claim overwrites with the real execution start.
 *
 * Idempotent on the runId PK: a duplicate enqueue (23505) returns
 * `{created:false}` without throwing or overwriting. Any other DB error throws.
 */
export async function createQueuedWorkflowRun(
  input: CreateQueuedWorkflowRunInput,
): Promise<CreateQueuedWorkflowRunResult> {
  const supabase = getServiceRoleClient(
    `enqueue: createQueuedWorkflowRun ${input.runId} (workflow ${input.workflowId})`,
  );
  const { error } = await supabase.from("workflow_runs").insert({
    id: input.runId,
    workflow_id: input.workflowId,
    account_id: input.accountId,
    triggered_by_user_id: input.triggeredByUserId,
    status: "queued",
    trigger_node_id: input.triggerNodeId,
    trigger_event: input.triggerEvent,
    steps: [],
    started_at: input.enqueuedAt,
    finished_at: null,
    is_test: input.isTest,
    triggered_by: input.triggeredBy,
    triggered_by_api_key_id: input.triggeredByApiKeyId ?? null,
    triggered_by_api_key_prefix: input.triggeredByApiKeyPrefix ?? null,
    estimated_task_cost: null,
    actual_task_cost: null,
    task_cost_policy_version: null,
    revision_id: null,
  });
  if (error) {
    if (error.code === "23505") return { created: false };
    throw new Error(`workflow_runs.createQueuedWorkflowRun failed: ${error.message}`);
  }
  return { created: true };
}

export interface ClaimQueuedWorkflowRunInput {
  runId: string;
  /** Actual execution start; overwrites the queued-row placeholder. */
  startedAt: string;
  /** Resolved active revision (null for draft/test/fallback). Stamped on claim. */
  revisionId?: string | null;
}

export interface ClaimQueuedWorkflowRunResult {
  /** true ⇒ THIS caller won the claim and must execute. false ⇒ lost / not queued. */
  claimed: boolean;
}

/**
 * Atomically transition a 'queued' row to 'running' (the durable-queue claim).
 *
 * Single statement: `UPDATE ... SET status='running', started_at, revision_id
 * WHERE id = runId AND status = 'queued'`. Postgres row-locks the row, so two
 * concurrent claims on the same runId serialize: the first wins (1 row), the
 * second re-evaluates the `status='queued'` predicate against the committed
 * 'running' row and matches 0 rows. `claimed` is therefore the single-winner
 * signal — no double execution. A row that is missing or already
 * running/terminal yields `{claimed:false}`.
 */
export async function claimQueuedWorkflowRun(
  input: ClaimQueuedWorkflowRunInput,
): Promise<ClaimQueuedWorkflowRunResult> {
  const supabase = getServiceRoleClient(
    `processor: claimQueuedWorkflowRun ${input.runId}`,
  );
  const { data, error } = await supabase
    .from("workflow_runs")
    .update({
      status: "running",
      started_at: input.startedAt,
      revision_id: input.revisionId ?? null,
    })
    .eq("id", input.runId)
    .eq("status", "queued")
    .select("id");
  if (error) {
    throw new Error(`workflow_runs.claimQueuedWorkflowRun failed: ${error.message}`);
  }
  return { claimed: (data?.length ?? 0) > 0 };
}

/** The minimal envelope the processor needs to re-invoke the engine for a queued run. */
export interface QueuedRunDispatch {
  runId: string;
  workflowId: string;
  triggerNodeId: string;
  triggerEvent: TriggerEvent;
  isTest: boolean;
  triggeredBy: WorkflowRunTriggeredBy;
  triggeredByUserId: string | null;
  triggeredByApiKeyId: string | null;
  triggeredByApiKeyPrefix: string | null;
}

const QUEUED_DISPATCH_COLUMNS =
  "id,workflow_id,trigger_node_id,trigger_event,is_test,triggered_by,triggered_by_user_id,triggered_by_api_key_id,triggered_by_api_key_prefix";

interface QueuedDispatchRow {
  id: string;
  workflow_id: string;
  trigger_node_id: string;
  trigger_event: TriggerEvent;
  is_test: boolean;
  triggered_by: WorkflowRunTriggeredBy;
  triggered_by_user_id: string | null;
  triggered_by_api_key_id: string | null;
  triggered_by_api_key_prefix: string | null;
}

function dispatchRowToEnvelope(row: QueuedDispatchRow): QueuedRunDispatch {
  return {
    runId: row.id,
    workflowId: row.workflow_id,
    triggerNodeId: row.trigger_node_id,
    triggerEvent: row.trigger_event,
    isTest: row.is_test,
    triggeredBy: row.triggered_by,
    triggeredByUserId: row.triggered_by_user_id,
    triggeredByApiKeyId: row.triggered_by_api_key_id,
    triggeredByApiKeyPrefix: row.triggered_by_api_key_prefix,
  };
}

/**
 * Read the dispatch envelope for ONE still-queued run (the run-now inline-drain
 * fast path). Returns null when the row is absent or no longer queued (already
 * drained / claimed elsewhere) — the caller then does nothing. The engine's own
 * claim remains the authoritative single-winner gate even when two callers both
 * read the same queued row.
 */
export async function getQueuedRunForDispatch(
  runId: string,
): Promise<QueuedRunDispatch | null> {
  const supabase = getServiceRoleClient(
    `processor: getQueuedRunForDispatch ${runId}`,
  );
  const { data, error } = await supabase
    .from("workflow_runs")
    .select(QUEUED_DISPATCH_COLUMNS)
    .eq("id", runId)
    .eq("status", "queued")
    .maybeSingle<QueuedDispatchRow>();
  if (error) {
    throw new Error(`workflow_runs.getQueuedRunForDispatch failed: ${error.message}`);
  }
  return data ? dispatchRowToEnvelope(data) : null;
}

/**
 * List the oldest queued runs (FIFO by created_at) for the cron processor.
 * Returns dispatch envelopes only — no account_id / steps / billing columns.
 * Does NOT claim; each run is claimed authoritatively by the engine when
 * executed, so concurrent processors are safe (the loser refuses as duplicate).
 */
export async function listQueuedWorkflowRunsForDispatch(
  limit: number,
): Promise<readonly QueuedRunDispatch[]> {
  const supabase = getServiceRoleClient(
    "processor: listQueuedWorkflowRunsForDispatch",
  );
  const capped = Math.min(Math.max(limit, 1), 500);
  const { data, error } = await supabase
    .from("workflow_runs")
    .select(QUEUED_DISPATCH_COLUMNS)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(capped);
  if (error) {
    throw new Error(
      `workflow_runs.listQueuedWorkflowRunsForDispatch failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => dispatchRowToEnvelope(r as QueuedDispatchRow));
}

export interface SweepStaleQueuedWorkflowRunsInput {
  /** ISO timestamp; queued rows with `started_at` (the enqueue placeholder) strictly before this are stale. */
  cutoff: string;
  fatalError: WorkflowRunFatalError;
  errorClassification: WorkflowRunErrorClassification;
  finishedAt: string;
  /** Optional batch cap. Omitted ⇒ sweep all matching rows in one UPDATE. */
  limit?: number;
}

export interface SweepStaleQueuedWorkflowRunsResult {
  sweptCount: number;
  runIds: string[];
  cutoff: string;
}

/**
 * Finalize runs stuck in 'queued' past the cutoff as 'failed' — the queue
 * counterpart to the stale-'running' sweep. A queued run normally drains within
 * ~a minute (run-now inline `after()` drain + the every-minute process-run-queue
 * cron); a row still queued long after `started_at` (the enqueue placeholder)
 * means the processor never claimed it (wedged worker / cron outage). Without this
 * the run would sit queued forever — the backlog ALERT surfaces the condition to
 * ops, and this finalizer gives each affected run a real terminal state + a
 * humanized error instead of an indefinite hang.
 *
 * Race-safe + idempotent: the predicate `status='queued' AND started_at < cutoff`
 * stops matching once a row is claimed (→ 'running') or swept (→ 'failed'), so it
 * never fights the processor's claim (whichever wins, the other matches 0 rows)
 * and never double-finalizes. Mirrors `sweepStaleRunningWorkflowRuns`.
 */
export async function sweepStaleQueuedWorkflowRuns(
  input: SweepStaleQueuedWorkflowRunsInput,
): Promise<SweepStaleQueuedWorkflowRunsResult> {
  const supabase = getServiceRoleClient(
    `cron: sweepStaleQueuedWorkflowRuns (cutoff ${input.cutoff})`,
  );

  let limitIds: string[] | null = null;
  if (input.limit !== undefined) {
    const sel = await supabase
      .from("workflow_runs")
      .select("id")
      .eq("status", "queued")
      .lt("started_at", input.cutoff)
      .order("started_at", { ascending: true })
      .limit(input.limit);
    if (sel.error) {
      throw new Error(
        `workflow_runs.sweepStaleQueuedWorkflowRuns (select) failed: ${sel.error.message}`,
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
    })
    .eq("status", "queued")
    .lt("started_at", input.cutoff);
  if (limitIds !== null) query = query.in("id", limitIds);

  const { data, error } = await query.select("id");
  if (error) {
    throw new Error(`workflow_runs.sweepStaleQueuedWorkflowRuns failed: ${error.message}`);
  }
  const runIds = (data ?? []).map((r) => (r as { id: string }).id);
  return { sweptCount: runIds.length, runIds, cutoff: input.cutoff };
}

export interface FailQueuedRunIfStillQueuedInput {
  runId: string;
  fatalError: WorkflowRunFatalError;
  errorClassification: WorkflowRunErrorClassification;
  finishedAt: string;
}

export interface FailQueuedRunIfStillQueuedResult {
  /** true ⇒ the row was still queued and is now terminal 'failed'. */
  failed: boolean;
}

/**
 * Finalize a run as 'failed' ONLY while it is still 'queued'. Guards the rare
 * pre-claim fatal (the engine hit WORKFLOW_NOT_FOUND / TRIGGER_NODE_NOT_FOUND
 * before it could claim the row, leaving it queued) — without this the cron
 * would re-select that row forever. Race-safe via `WHERE status='queued'`: a
 * row the engine successfully claimed (now running/terminal) is never touched.
 */
export async function failQueuedRunIfStillQueued(
  input: FailQueuedRunIfStillQueuedInput,
): Promise<FailQueuedRunIfStillQueuedResult> {
  const supabase = getServiceRoleClient(
    `processor: failQueuedRunIfStillQueued ${input.runId}`,
  );
  const { data, error } = await supabase
    .from("workflow_runs")
    .update({
      status: "failed",
      fatal_error: input.fatalError,
      error_classification: input.errorClassification,
      finished_at: input.finishedAt,
    })
    .eq("id", input.runId)
    .eq("status", "queued")
    .select("id");
  if (error) {
    throw new Error(`workflow_runs.failQueuedRunIfStillQueued failed: ${error.message}`);
  }
  return { failed: (data?.length ?? 0) > 0 };
}
