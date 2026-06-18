import { render, screen } from "@testing-library/react";
import { WidgetBody } from "@/features/analytics/widgetBodies";
import type {
  AnalyticsOverview,
  AnalyticsWidget,
} from "@/contracts/analytics";

/**
 * Widget-body rendering (Slice ANALYTICS-1): real overview data maps to the
 * right widget, and missing data renders an honest empty state (no fakery).
 */

const OVERVIEW: AnalyticsOverview = {
  range: { id: "7d", since: "2026-06-10T00:00:00Z", until: "2026-06-17T00:00:00Z" },
  totals: {
    runs: 1843,
    succeeded: 1810,
    failed: 33,
    successRate: 1810 / 1843,
    avgDurationMs: 142,
    activeWorkflows: 6,
    totalWorkflows: 9,
    connectedApps: 2,
  },
  previousTotals: {
    runs: 1562,
    succeeded: 1500,
    failed: 62,
    successRate: 1500 / 1562,
    avgDurationMs: 160,
    activeWorkflows: 5,
    totalWorkflows: 9,
    connectedApps: 2,
  },
  runsOverTime: [
    { date: "2026-06-15", succeeded: 100, failed: 2 },
    { date: "2026-06-16", succeeded: 120, failed: 4 },
  ],
  workflows: [
    { workflowId: "11111111-1111-1111-1111-111111111111", name: "Welcome flow", runs: 900, succeeded: 880, successRate: 880 / 900, avgDurationMs: 120 },
  ],
  apps: [{ provider: "slack", label: "Slack", connections: 2 }],
  heatmap: { weeks: 16, cells: [1, 0, 2], maxCell: 2, total: 3 },
  recentRuns: [
    { id: "22222222-2222-2222-2222-222222222222", workflowName: "Welcome flow", status: "succeeded", startedAt: "2026-06-17T11:59:00Z", durationMs: 142 },
  ],
  truncated: false,
};

function widget(partial: Partial<AnalyticsWidget>): AnalyticsWidget {
  return {
    id: partial.id ?? "w1",
    type: partial.type ?? "stat",
    size: partial.size ?? "s",
    title: partial.title ?? "Widget",
    config: partial.config ?? { source: "any", metric: "runs" },
  };
}

describe("WidgetBody", () => {
  it("renders the runs stat from real totals", () => {
    render(<WidgetBody overview={OVERVIEW} widget={widget({ type: "stat", config: { source: "any", metric: "runs" } })} />);
    expect(screen.getByText("1,843")).toBeInTheDocument();
  });

  it("renders the success-rate stat as a percentage", () => {
    render(<WidgetBody overview={OVERVIEW} widget={widget({ type: "stat", config: { source: "any", metric: "success_rate" } })} />);
    expect(screen.getByText("98%")).toBeInTheDocument();
  });

  it("renders a note widget's text without needing data", () => {
    render(
      <WidgetBody
        overview={null}
        widget={widget({ type: "note", config: { source: "any", note: "Hello team" } })}
      />,
    );
    expect(screen.getByText("Hello team")).toBeInTheDocument();
  });

  it("renders an honest empty state when a chart has no runs", () => {
    const empty = { ...OVERVIEW, runsOverTime: [] };
    render(<WidgetBody overview={empty} widget={widget({ type: "line", config: { source: "any", metric: "runs_over_time" } })} />);
    expect(screen.getByText(/No runs in this range yet/i)).toBeInTheDocument();
  });

  it("renders the recent-runs feed from real data", () => {
    render(<WidgetBody overview={OVERVIEW} widget={widget({ type: "activity", config: { source: "any", metric: "events" } })} />);
    expect(screen.getByText("Welcome flow")).toBeInTheDocument();
  });

  it("shows a loading state when data is not yet available", () => {
    render(<WidgetBody overview={null} widget={widget({ type: "stat", config: { source: "any", metric: "runs" } })} />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });
});
