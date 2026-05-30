import type { WorkflowRunStats } from "@/contracts/workflow";

/**
 * Generic, lifetime-safe copy for a workflow's run stats
 * (Slice 4.WORKFLOWS-PAGE-1).
 *
 * The `workflow_run_stats` view aggregates LIFETIME runs (real, non-test). UI
 * copy must never imply "today" / "24h" — that requires a time-bucketed view
 * we don't have. This helper returns:
 *   - "No runs yet"
 *   - "Ran 217 times · 94% successful"
 * Pure, used by both the row + card views.
 */
export function formatRunStats(stats: WorkflowRunStats): string {
  if (stats.total === 0) return "No runs yet";
  const pct = Math.round(stats.successRate * 100);
  const noun = stats.total === 1 ? "time" : "times";
  return `Ran ${stats.total.toLocaleString()} ${noun} · ${pct}% successful`;
}
