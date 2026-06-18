import { getServiceRoleClient } from "./supabase/serviceRoleClient";
import type { WorkflowRunStats } from "@/contracts/workflow";

/**
 * Repository for the `workflow_run_stats` view (Slice 4.WORKFLOWS-PAGE-1;
 * account-scoped read added in 4.ACCOUNT-SWITCHER-1).
 *
 * V2-READY-51-HOTFIX: read via SERVICE-ROLE, not the SSR-cookie client.
 * `workflow_run_stats` is a `security_invoker=true` view over `workflow_runs`,
 * and V2-READY-51 revoked `authenticated` SELECT on `workflow_runs` (payload
 * lockdown). A security_invoker view executes with the INVOKER's privileges, so
 * reading it as `authenticated` now fails `42501 permission denied for table
 * workflow_runs` — which 500'd the authenticated `/workflows` shell + GET
 * /api/workflows. The view exposes ONLY safe aggregates (counts / last-run
 * status), never raw payload columns, so routing it through a service-role
 * repository is the correct fix (mirrors `workflowRuns.listByAccountForDisplay`).
 *
 * NON-AUTHORIZING — the service-role read bypasses RLS. The caller MUST pass an
 * account it resolved from its OWN session (the `/workflows` page +
 * `/api/workflows` both pass the caller's active account from
 * `resolveActiveAccount`/`requireUserWithAccount`); the `eq('account_id', …)`
 * filter then scopes the aggregates to that one account. One query (no N+1).
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
 * Service-role read (see module header); the explicit `account_id` filter scopes
 * to the caller's resolved ACTIVE account, which the caller authorized. Used by
 * the workflows dashboard SSR + GET /api/workflows so stats match the account
 * whose workflows/folders are shown.
 */
export async function getStatsForAccount(
  accountId: string,
): Promise<Map<string, WorkflowRunStats>> {
  const supabase = getServiceRoleClient(
    `workflow_run_stats: getStatsForAccount ${accountId}`,
  );
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
