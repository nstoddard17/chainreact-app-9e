import { getServiceRoleClient } from "../supabase/serviceRoleClient";
import type {
  WorkflowRunErrorClassification,
  WorkflowRunTriggeredBy,
} from "../workflowRuns";
import type { WorkflowRunLifecycleStatus } from "../workflowRunsLifecycle";

/**
 * MOBILE-COMPANION-M1 — sessionless run readers for the bearer-authed
 * `/api/mobile/v1` namespace (sibling per the workflowRunsDiagnostics
 * precedent). Two postures distinguish these from every other run reader:
 *
 *   1. ANY STATUS — queued/running rows are first-class (the signature
 *      journey: a run-now id must be fetchable before it finalizes).
 *   2. NARROW AT SQL — `trigger_event` and `fatal_error` are NEVER selected,
 *      so raw upstream payloads and engine internals cannot even REACH the
 *      mobile mapping layer. `steps` is selected for the detail reader only,
 *      and each step is reduced AT THIS ROW BOUNDARY to
 *      `{nodeId, status, error{code,message}}` — outputs and error `details`
 *      are dropped before any service sees the row.
 *
 * NON-AUTHORIZING: the mobile gate verified the bearer user + account
 * membership; explicit `account_id` (and `workflow_id`) predicates are the
 * scope. The detail reader also RETURNS the row's own account/workflow ids so
 * the service can cross-check ownership fail-closed.
 */

const MOBILE_RUN_LIST_COLUMNS =
  "id,workflow_id,status,is_test,triggered_by,started_at,finished_at,error_classification";

const MOBILE_RUN_DETAIL_COLUMNS = `${MOBILE_RUN_LIST_COLUMNS},account_id,steps`;

export interface MobileRunListRecord {
  id: string;
  workflowId: string;
  status: WorkflowRunLifecycleStatus;
  isTest: boolean;
  triggeredBy: WorkflowRunTriggeredBy;
  startedAt: string;
  finishedAt: string | null;
  errorClassification: WorkflowRunErrorClassification | null;
}

/** A step already reduced to the mobile-safe trio at the row boundary. */
export interface MobileRunStepRecord {
  nodeId: string;
  status: "succeeded" | "failed" | "skipped";
  error: { code: string; message: string } | null;
}

export interface MobileRunDetailRecord extends MobileRunListRecord {
  accountId: string;
  steps: readonly MobileRunStepRecord[];
}

interface MobileRunListRow {
  id: string;
  workflow_id: string;
  status: WorkflowRunLifecycleStatus;
  is_test: boolean;
  triggered_by: WorkflowRunTriggeredBy;
  started_at: string;
  finished_at: string | null;
  error_classification: WorkflowRunErrorClassification | null;
}

function rowToListRecord(row: MobileRunListRow): MobileRunListRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    status: row.status,
    isTest: row.is_test,
    triggeredBy: row.triggered_by,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorClassification: row.error_classification,
  };
}

/** Reduce a persisted step to the mobile-safe trio. NEVER carries output. */
function toMobileStep(step: unknown): MobileRunStepRecord | null {
  if (typeof step !== "object" || step === null) return null;
  const s = step as {
    nodeId?: unknown;
    status?: unknown;
    error?: { code?: unknown; message?: unknown } | null;
  };
  if (typeof s.nodeId !== "string") return null;
  if (s.status !== "succeeded" && s.status !== "failed" && s.status !== "skipped") {
    return null;
  }
  const error =
    s.error && typeof s.error.code === "string" && typeof s.error.message === "string"
      ? { code: s.error.code, message: s.error.message }
      : null;
  return { nodeId: s.nodeId, status: s.status, error };
}

export interface ListRunsPageOptions {
  /** Rows to fetch. The SERVICE passes its clamped limit + 1 to detect more. */
  limit: number;
  /** Exclusive keyset position `(started_at, id) < (sortTs, id)`. */
  before?: { sortTs: string; id: string };
  /** Optional scope to one workflow (per-workflow list). */
  workflowId?: string;
  /** Optional exact display-status filter (already schema-validated). */
  status?: WorkflowRunLifecycleStatus;
}

export async function listPageByAccountForMobileServiceRole(
  accountId: string,
  opts: ListRunsPageOptions,
): Promise<readonly MobileRunListRecord[]> {
  const supabase = getServiceRoleClient(
    `runs: listPageByAccountForMobileServiceRole account ${accountId}`,
  );
  let query = supabase
    .from("workflow_runs")
    .select(MOBILE_RUN_LIST_COLUMNS)
    .eq("account_id", accountId);
  if (opts.workflowId) query = query.eq("workflow_id", opts.workflowId);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.before) {
    query = query.or(
      `started_at.lt.${opts.before.sortTs},and(started_at.eq.${opts.before.sortTs},id.lt.${opts.before.id})`,
    );
  }
  const { data, error } = await query
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit);
  if (error) {
    throw new Error(
      `workflow_runs.listPageByAccountForMobileServiceRole failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => rowToListRecord(r as unknown as MobileRunListRow));
}

/**
 * ANY-status run fetch for the mobile detail endpoint. Returns null for a
 * missing id; the SERVICE must cross-check `accountId`/`workflowId` against
 * the caller's verified scope and collapse mismatches to not-found.
 */
export async function getRunForMobileDetailServiceRole(
  runId: string,
): Promise<MobileRunDetailRecord | null> {
  const supabase = getServiceRoleClient(
    `runs: getRunForMobileDetailServiceRole ${runId}`,
  );
  const { data, error } = await supabase
    .from("workflow_runs")
    .select(MOBILE_RUN_DETAIL_COLUMNS)
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `workflow_runs.getRunForMobileDetailServiceRole failed: ${error.message}`,
    );
  }
  if (!data) return null;
  const row = data as unknown as MobileRunListRow & {
    account_id: string;
    steps: unknown;
  };
  const steps = Array.isArray(row.steps)
    ? row.steps.map(toMobileStep).filter((s): s is MobileRunStepRecord => s !== null)
    : [];
  return { ...rowToListRecord(row), accountId: row.account_id, steps };
}
