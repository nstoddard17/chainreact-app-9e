import { createClient } from "@/utils/supabase/server";
import type { WorkflowRunStats } from "@/contracts/workflow";

/**
 * Repository for the `workflow_run_stats` view (Slice 4.WORKFLOWS-PAGE-1;
 * account-scoped read added in 4.ACCOUNT-SWITCHER-1).
 *
 * Read via the SSR-cookie client so the view's `security_invoker` semantics +
 * the underlying `workflow_runs` RLS gate access. After the 4.ACCOUNT-MODEL-8
 * cutover that RLS is ACCOUNT-MEMBERSHIP based (not user_id), so the view
 * returns aggregates for every workflow the caller can see across ALL their
 * accounts. `getStatsForAccount` adds an explicit `account_id` filter so the
 * dashboard shows run stats for the caller's ACTIVE account only — matching the
 * account its workflow/folder lists are scoped to. One query (no N+1).
 */

interface WorkflowRunStatsRow {
  workflow_id: string;
  total: number | string;
  succeeded: number | string;
  last_run_at: string | null;
  last_run_status: "succeeded" | "failed" | null;
}

const EMPTY_STATS: WorkflowRunStats = {
  total: 0,
  succeeded: 0,
  successRate: 0,
  lastRunAt: null,
  lastRunStatus: null,
};

/** Stats for a workflow with no recorded (real) runs. */
export function emptyRunStats(): WorkflowRunStats {
  return { ...EMPTY_STATS };
}

/**
 * Lifetime run-stats for every workflow in `accountId`, keyed by workflow_id.
 * Explicit `account_id` filter scopes to the caller's ACTIVE account (RLS still
 * gates membership). Used by the workflows dashboard SSR + GET /api/workflows so
 * stats match the account whose workflows/folders are shown.
 */
export async function getStatsForAccount(
  accountId: string,
): Promise<Map<string, WorkflowRunStats>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_run_stats")
    .select("workflow_id, total, succeeded, last_run_at, last_run_status")
    .eq("account_id", accountId);
  if (error) {
    throw new Error(`workflowRunStats.getStatsForAccount failed: ${error.message}`);
  }
  const out = new Map<string, WorkflowRunStats>();
  for (const raw of (data ?? []) as WorkflowRunStatsRow[]) {
    const total = Number(raw.total) || 0;
    const succeeded = Number(raw.succeeded) || 0;
    out.set(raw.workflow_id, {
      total,
      succeeded,
      successRate: total > 0 ? succeeded / total : 0,
      lastRunAt: raw.last_run_at,
      lastRunStatus: raw.last_run_status,
    });
  }
  return out;
}
