import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type {
  WorkflowRunRecord,
  WorkflowRunStatus,
  WorkflowRunStep,
  WorkflowRunFatalError,
  WorkflowRunErrorClassification,
  WorkflowRunTriggeredBy,
} from "./workflowRuns";

/**
 * Sessionless, service-role run readers for the INTERNAL DIAGNOSTICS surface
 * (Slice 4.MCP-STAGE-2B-3, CS-1). Read-only; reads the existing `workflow_runs`
 * table only — NO schema change, NO migration.
 *
 * Why these exist separately from the UI readers in `workflowRuns.ts`:
 *   - The UI readers (`getById` / `listByWorkflow` / `listByAccountForDisplay`)
 *     use the SSR-cookie client (RLS) and DELIBERATELY exclude `status='running'`
 *     (the display contract is terminal-only). A machine-gated diagnostics route
 *     has no session AND must be able to SEE a running row to explain why a run
 *     is "missing" from /runs. These readers use service-role and do not filter
 *     `running` (opt-in via `includeRunning`).
 *   - `WorkflowRunStatus` is `succeeded | failed` (terminal). A live row can be
 *     `running`, so these return a WIDENED `DiagnosticsRunRecord` whose `status`
 *     also admits `running` — WITHOUT touching `WorkflowRunRecord` or the
 *     terminal-only display path.
 *
 * AUTHORIZATION — IMPORTANT: these functions do NOT authorize anything. Like the
 * service-role integration readers, they are raw reads that bypass RLS. The
 * future CS-2 route MUST:
 *   1. gate with `applyDiagnosticsGate` (machine bearer, default-OFF, prod-lock), THEN
 *   2. verify `isMemberServiceRole(run.accountId, subjectUserId)` BEFORE returning
 *      anything to the caller.
 * This is a server-only diagnostics seam, NOT a generic public bypass. Do not
 * import it from client code or wire it to an unauthenticated path.
 */

/** Live run status incl. the non-terminal `queued`/`running` the UI readers hide. */
export type DiagnosticsRunStatus = WorkflowRunStatus | "running" | "queued";

/**
 * `WorkflowRunRecord` widened so `status` can be `running`. Identical otherwise —
 * the diagnostics route narrows this to a sanitized DTO; the raw record (which
 * still carries `steps`/`triggerEvent`/`fatalError`) NEVER leaves the app.
 */
export type DiagnosticsRunRecord = Omit<WorkflowRunRecord, "status"> & {
  status: DiagnosticsRunStatus;
};

/** Row shape with the widened status (the column can hold `running`). */
interface DiagnosticsRunRow {
  id: string;
  workflow_id: string;
  account_id: string;
  triggered_by_user_id: string | null;
  status: DiagnosticsRunStatus;
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

function rowToDiagnosticsRecord(row: DiagnosticsRunRow): DiagnosticsRunRecord {
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

/**
 * Service-role: fetch a single run by id, INCLUDING a `running` row. Returns the
 * full record (the route sanitizes). Null when the id matches nothing.
 *
 * Non-authorizing — see the module header. The route gates + checks membership on
 * `run.accountId` before returning.
 */
export async function getByIdServiceRole(
  runId: string,
): Promise<DiagnosticsRunRecord | null> {
  const supabase = getServiceRoleClient(
    `diagnostics: workflowRuns.getByIdServiceRole ${runId}`,
  );
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle<DiagnosticsRunRow>();
  if (error) {
    throw new Error(`workflow_runs.getByIdServiceRole failed: ${error.message}`);
  }
  return data ? rowToDiagnosticsRecord(data) : null;
}

export interface ListRunsForDiagnosticsOptions {
  /**
   * When true, `running` rows are included (the whole point of the diagnostics
   * reader). Default false — keeps the terminal-only behavior unless opted in.
   */
  includeRunning?: boolean;
  /** Defaults to 25; capped at 100. */
  limit?: number;
}

/**
 * Service-role: list a workflow's runs, newest first. With `includeRunning`,
 * non-terminal rows are returned so diagnostics can explain a hidden/in-progress
 * run. Non-authorizing — see the module header.
 */
export async function listByWorkflowServiceRole(
  workflowId: string,
  opts: ListRunsForDiagnosticsOptions = {},
): Promise<readonly DiagnosticsRunRecord[]> {
  const supabase = getServiceRoleClient(
    `diagnostics: workflowRuns.listByWorkflowServiceRole ${workflowId}`,
  );
  const limit = Math.min(opts.limit ?? 25, 100);
  let query = supabase
    .from("workflow_runs")
    .select("*")
    .eq("workflow_id", workflowId);
  if (!opts.includeRunning) {
    // Terminal-only unless opted in — hide both non-terminal states (Slice 6
    // adds 'queued' alongside the pre-existing 'running').
    query = query.neq("status", "running").neq("status", "queued");
  }
  const { data, error } = await query
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(
      `workflow_runs.listByWorkflowServiceRole failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => rowToDiagnosticsRecord(r as DiagnosticsRunRow));
}
