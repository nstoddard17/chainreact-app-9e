import { createClient } from "@/utils/supabase/server";
import type { WorkflowRunStats } from "@/contracts/workflow";

/**
 * Repository for the `workflow_run_stats` view (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Read via the SSR-cookie client so the view's `security_invoker` semantics +
 * the underlying `workflow_runs` RLS gate per-user access — a user only ever
 * sees aggregates of their OWN runs. One query for the whole list (no N+1).
 *
 * The view exposes no `user_id` (it groups by `workflow_id` after RLS has
 * filtered rows), so there is nothing to filter here — RLS already scoped it.
 * The `userId` argument is kept for call-site symmetry + future-proofing.
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

export async function getStatsForUser(
  _userId: string,
): Promise<Map<string, WorkflowRunStats>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_run_stats")
    .select("workflow_id, total, succeeded, last_run_at, last_run_status");
  if (error) {
    throw new Error(`workflowRunStats.getStatsForUser failed: ${error.message}`);
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
