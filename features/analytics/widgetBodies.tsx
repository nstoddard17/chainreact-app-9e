"use client";

/**
 * Widget bodies (Slice ANALYTICS-1) — render each widget type from the real,
 * account-scoped `AnalyticsOverview`. A widget binds to a metric (+ optional
 * workflow `source`); this maps that binding to a chart/list. Nothing is faked:
 * an unbacked binding or empty data renders an honest empty state.
 */

import type { AnalyticsOverview, AnalyticsWidget } from "@/contracts/analytics";
import {
  BarChart,
  CHART_COLORS,
  DonutChart,
  Heatmap,
  LineChart,
  MetricNumber,
  Sparkline,
  formatDuration,
  formatNumber,
  type BarRow,
} from "@/components/analytics/charts";

function EmptyBody({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[80px] items-center justify-center text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}

/** Daily totals (succeeded+failed) from the overview, for stat sparklines. */
function dailyTotals(overview: AnalyticsOverview): number[] {
  return overview.runsOverTime.map((p) => p.succeeded + p.failed);
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Per-workflow scalar slice when a stat widget targets a specific workflow. */
function workflowSlice(overview: AnalyticsOverview, workflowId: string) {
  return overview.workflows.find((w) => w.workflowId === workflowId) ?? null;
}

function StatBody({ overview, widget }: { overview: AnalyticsOverview; widget: AnalyticsWidget }) {
  const metric = widget.config.metric;
  const source = widget.config.source;
  const slice = source !== "any" ? workflowSlice(overview, source) : null;
  const totals = overview.totals;
  const prev = overview.previousTotals;

  let value = 0;
  let previous: number | null = null;
  let suffix = "";
  let display: string | null = null;
  let foot = "";

  if (metric === "success_rate") {
    value = Math.round((slice ? slice.successRate : totals.successRate) * 100);
    previous = slice ? null : Math.round(prev.successRate * 100);
    suffix = "%";
    foot = slice ? slice.name : `${formatNumber(totals.succeeded)} of ${formatNumber(totals.runs)} succeeded`;
  } else if (metric === "active_workflows") {
    value = totals.activeWorkflows;
    foot = `of ${formatNumber(totals.totalWorkflows)} total`;
  } else if (metric === "avg_duration") {
    display = formatDuration(slice ? slice.avgDurationMs : totals.avgDurationMs);
    foot = slice ? slice.name : "average run time";
  } else {
    // default: runs
    value = slice ? slice.runs : totals.runs;
    previous = slice ? null : prev.runs;
    foot = slice ? slice.name : "in selected range";
  }

  return (
    <div className="flex h-full flex-col gap-2.5">
      {display !== null ? (
        <div className="text-3xl font-bold leading-none tracking-tight text-foreground">{display}</div>
      ) : (
        <MetricNumber value={value} previous={previous} suffix={suffix} />
      )}
      <div className="-mt-1">
        <Sparkline data={dailyTotals(overview)} width={150} height={42} color={CHART_COLORS.primary} />
      </div>
      <div className="mt-auto truncate text-[11.5px] text-muted-foreground">{foot}</div>
    </div>
  );
}

function LineBody({ overview }: { overview: AnalyticsOverview }) {
  if (overview.runsOverTime.length === 0) return <EmptyBody label="No runs in this range yet." />;
  const labels = overview.runsOverTime.map((p) => shortDate(p.date));
  return (
    <LineChart
      labels={labels}
      series={[
        { name: "Successful runs", data: overview.runsOverTime.map((p) => p.succeeded), color: CHART_COLORS.success },
        { name: "Failed runs", data: overview.runsOverTime.map((p) => p.failed), color: CHART_COLORS.danger },
      ]}
      height={220}
    />
  );
}

function DonutBody({ overview }: { overview: AnalyticsOverview }) {
  const { succeeded, failed, runs, successRate } = overview.totals;
  if (runs === 0) return <EmptyBody label="No runs in this range yet." />;
  return (
    <DonutChart
      center={`${Math.round(successRate * 100)}%`}
      sublabel="successful"
      segments={[
        { label: "Succeeded", value: succeeded, color: CHART_COLORS.success },
        { label: "Failed", value: failed, color: CHART_COLORS.danger },
      ]}
    />
  );
}

function BarBody({ overview, widget }: { overview: AnalyticsOverview; widget: AnalyticsWidget }) {
  if (widget.config.metric === "by_app") {
    if (overview.apps.length === 0) return <EmptyBody label="No connected apps yet." />;
    const rows: BarRow[] = overview.apps.slice(0, 6).map((a) => ({ label: a.label, value: a.connections }));
    return <BarChart rows={rows} />;
  }
  // top_workflows (default)
  if (overview.workflows.length === 0) return <EmptyBody label="No runs in this range yet." />;
  const rows: BarRow[] = overview.workflows.slice(0, 6).map((w) => ({ label: w.name, value: w.runs }));
  return <BarChart rows={rows} />;
}

function HeatmapBody({ overview }: { overview: AnalyticsOverview }) {
  if (overview.heatmap.total === 0) return <EmptyBody label="No activity in the last 16 weeks." />;
  return (
    <div>
      <Heatmap cells={overview.heatmap.cells} weeks={overview.heatmap.weeks} maxCell={overview.heatmap.maxCell} />
      <div className="mt-2.5 text-[11.5px] text-muted-foreground">
        {formatNumber(overview.heatmap.total)} runs in the last {overview.heatmap.weeks} weeks
      </div>
    </div>
  );
}

function TableBody({ overview }: { overview: AnalyticsOverview }) {
  if (overview.workflows.length === 0) return <EmptyBody label="No runs in this range yet." />;
  const cols = ["Automation", "Runs", "Success"];
  return (
    <div className="flex flex-col text-xs">
      <div className="mb-1 grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border pb-2 text-[11px] font-semibold text-muted-foreground">
        {cols.map((c) => (
          <div key={c} className={c === "Automation" ? "" : "text-right"}>
            {c}
          </div>
        ))}
      </div>
      {overview.workflows.slice(0, 6).map((w) => (
        <div key={w.workflowId} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-dashed border-border py-1.5 last:border-0">
          <div className="truncate text-foreground">{w.name}</div>
          <div className="text-right font-mono text-foreground">{formatNumber(w.runs)}</div>
          <div className="text-right font-mono text-foreground">{Math.round(w.successRate * 100)}%</div>
        </div>
      ))}
    </div>
  );
}

function ActivityBody({ overview }: { overview: AnalyticsOverview }) {
  if (overview.recentRuns.length === 0) return <EmptyBody label="No recent runs yet." />;
  return (
    <div className="flex flex-col">
      {overview.recentRuns.map((r) => (
        <div key={r.id} className="grid grid-cols-[12px_1fr_auto] items-center gap-2.5 border-b border-dashed border-border py-2 last:border-0">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: r.status === "succeeded" ? CHART_COLORS.success : CHART_COLORS.danger }}
          />
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-foreground">{r.workflowName}</div>
            <div className="text-[11px] text-muted-foreground">
              {r.status === "succeeded" ? "Succeeded" : "Failed"} · {relativeTime(r.startedAt)}
            </div>
          </div>
          <span className="font-mono text-[11.5px] text-foreground/80">{formatDuration(r.durationMs)}</span>
        </div>
      ))}
    </div>
  );
}

function NoteBody({ widget }: { widget: AnalyticsWidget }) {
  const body = widget.config.note ?? "";
  return (
    <div className="flex h-full items-start">
      <p className="text-[13.5px] leading-relaxed text-foreground/80">{body}</p>
    </div>
  );
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}

export function WidgetBody({
  overview,
  widget,
}: {
  overview: AnalyticsOverview | null;
  widget: AnalyticsWidget;
}) {
  if (widget.type === "note") return <NoteBody widget={widget} />;
  if (!overview) {
    return (
      <div className="flex h-full min-h-[80px] animate-pulse items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }
  switch (widget.type) {
    case "stat":
      return <StatBody overview={overview} widget={widget} />;
    case "line":
      return <LineBody overview={overview} />;
    case "donut":
      return <DonutBody overview={overview} />;
    case "bar":
      return <BarBody overview={overview} widget={widget} />;
    case "heatmap":
      return <HeatmapBody overview={overview} />;
    case "table":
      return <TableBody overview={overview} />;
    case "activity":
      return <ActivityBody overview={overview} />;
    default:
      return <EmptyBody label="Unsupported widget." />;
  }
}
