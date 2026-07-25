import type { WorkflowListItem } from "@/contracts/workflow";
import type { AccountUsageSummary } from "@/core/billing/accountUsageSummary";

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
 *
 * DASHBOARD-USAGE-VISIBILITY-1 adds two OPTIONAL account-usage cards — tasks
 * left and AI credits left this billing period — from the server-computed
 * `computeAccountUsageSummary` (the same display-safe shape Account Settings
 * renders, so dashboard numbers can never disagree with the billing page). A
 * dimension renders only when its data was actually available: no billing row /
 * failed read → the card is absent, never faked zeros.
 */
interface Props {
  workflows: readonly WorkflowListItem[];
  /** Account task + AI-credit usage (display-safe summary); null/absent → no usage cards. */
  usage?: AccountUsageSummary | null;
}

function formatResetDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function usageSub(
  dim: AccountUsageSummary["tasks"],
  noun: string,
  notBilled: boolean,
): string {
  const resets = dim.resetsAt ? ` · resets ${formatResetDate(dim.resetsAt)}` : "";
  const billing = notBilled ? " · not billed" : "";
  if (dim.overLimit) return `No ${noun} left this period${resets}${billing}`;
  return `${dim.used.toLocaleString()} of ${dim.limit.toLocaleString()} used${resets}${billing}`;
}

export function WorkflowsStatCards({ workflows, usage = null }: Props) {
  const total = workflows.length;
  const running = workflows.filter((w) => w.state === "active").length;
  const totalRuns = workflows.reduce((sum, w) => sum + w.runStats.total, 0);
  const totalSucceeded = workflows.reduce(
    (sum, w) => sum + w.runStats.succeeded,
    0,
  );
  const successRatePct =
    totalRuns > 0 ? Math.round((totalSucceeded / totalRuns) * 100) : null;
  // Both dimensions come from the same account_billing row, so in practice they
  // are available together; each still gates independently (honest, never faked).
  const taskUsage = usage?.tasks.available ? usage.tasks : null;
  const aiCreditsUsage = usage?.aiCredits.available ? usage.aiCredits : null;
  const usageCardCount = (taskUsage ? 1 : 0) + (aiCreditsUsage ? 1 : 0);

  return (
    <ul
      data-testid="workflows-stat-cards"
      className={
        usageCardCount > 0
          ? "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
          : "grid grid-cols-2 gap-3 md:grid-cols-4"
      }
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
      {taskUsage && (
        <StatCard
          testId="workflows-stat-tasks-left"
          label="Tasks left"
          value={taskUsage.remaining.toLocaleString()}
          sub={usageSub(taskUsage, "tasks", usage?.internalFree ?? false)}
          warn={taskUsage.nearLimit || taskUsage.overLimit}
        />
      )}
      {aiCreditsUsage && (
        <StatCard
          testId="workflows-stat-ai-credits-left"
          label="AI credits left"
          value={aiCreditsUsage.remaining.toLocaleString()}
          sub={usageSub(aiCreditsUsage, "AI credits", usage?.internalFree ?? false)}
          warn={aiCreditsUsage.nearLimit || aiCreditsUsage.overLimit}
        />
      )}
    </ul>
  );
}

function StatCard({
  testId,
  label,
  value,
  sub,
  warn = false,
}: {
  testId: string;
  label: string;
  value: string;
  sub: string;
  /** Near/over-limit usage — amber value + sub so exhaustion is visible at a glance. */
  warn?: boolean;
}) {
  return (
    <li
      data-testid={testId}
      className="flex flex-col gap-1 rounded-md border border-border bg-card p-4"
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={
          warn
            ? "text-2xl font-bold text-amber-600 dark:text-amber-400"
            : "text-2xl font-bold text-foreground"
        }
      >
        {value}
      </span>
      <span
        className={
          warn
            ? "text-[11px] font-medium text-amber-600 dark:text-amber-400"
            : "text-[11px] text-muted-foreground"
        }
      >
        {sub}
      </span>
    </li>
  );
}
