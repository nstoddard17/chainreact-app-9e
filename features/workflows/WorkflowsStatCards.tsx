import type { WorkflowListItem } from "@/contracts/workflow";

/**
 * Stat cards for the workflows dashboard (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Four metrics derived from the enriched list — every figure is **real** and
 * **cheap** (no extra fetch):
 *   1. Running           — count of workflows in state="active"
 *   2. Total automations — count of all (non-deleted) workflows
 *   3. Total runs        — sum of LIFETIME run totals across all workflows
 *   4. Success rate      — succeeded / total across LIFETIME runs
 *
 * Copy stays generic — the `workflow_run_stats` view is lifetime totals, so
 * the UI never implies "today" / "24h". (The design's "today runs" card is
 * deferred until a time-bucketed view exists.)
 */
interface Props {
  workflows: readonly WorkflowListItem[];
}

export function WorkflowsStatCards({ workflows }: Props) {
  const total = workflows.length;
  const running = workflows.filter((w) => w.state === "active").length;
  const totalRuns = workflows.reduce((sum, w) => sum + w.runStats.total, 0);
  const totalSucceeded = workflows.reduce(
    (sum, w) => sum + w.runStats.succeeded,
    0,
  );
  const successRatePct =
    totalRuns > 0 ? Math.round((totalSucceeded / totalRuns) * 100) : null;

  return (
    /*
      RESPONSIVE-PAGES-2 — content-aware instead of viewport-keyed. `grid-cols-2
      md:grid-cols-4` asked the wrong question: it stepped on VIEWPORT width and
      ignored how much room the container actually had once the sidebar is in
      play, so a 768px viewport jumped to four columns whose labels ("Total
      automations") then wrapped awkwardly. `auto-fit` with a 170px track fits as
      many as genuinely read well and drops to two, then one, on its own. The
      inner `min(...,100%)` keeps the track from exceeding a 360px screen.
    */
    <ul
      data-testid="workflows-stat-cards"
      className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-3"
    >
      <StatCard
        testId="workflows-stat-running"
        label="Running"
        value={running.toLocaleString()}
        sub={`of ${total.toLocaleString()} total`}
      />
      <StatCard
        testId="workflows-stat-total"
        label="Total automations"
        value={total.toLocaleString()}
        sub={total === 0 ? "Create your first" : "in this workspace"}
      />
      <StatCard
        testId="workflows-stat-runs"
        label="Total runs"
        value={totalRuns.toLocaleString()}
        sub="lifetime"
      />
      <StatCard
        testId="workflows-stat-success"
        label="Success rate"
        value={successRatePct === null ? "—" : `${successRatePct}%`}
        sub={successRatePct === null ? "No runs yet" : "lifetime"}
      />
    </ul>
  );
}

function StatCard({
  testId,
  label,
  value,
  sub,
}: {
  testId: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <li
      data-testid={testId}
      className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-card p-4"
    >
      {/* Labels and sub-lines WRAP rather than compressing — the figure itself is
          the thing that must stay legible, so nothing here truncates. */}
      <span className="break-words text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums text-foreground">{value}</span>
      <span className="break-words text-[11px] text-muted-foreground">{sub}</span>
    </li>
  );
}
