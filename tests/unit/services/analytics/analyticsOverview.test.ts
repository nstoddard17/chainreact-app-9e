import {
  buildAnalyticsOverview,
  computeRangeWindow,
  analyticsFetchSince,
  type BuildOverviewInput,
} from "@/services/analytics/analyticsOverview";
import type { AnalyticsRunRow } from "@/repositories/workflowRuns";

/**
 * Unit tests for the pure analytics aggregation (Slice ANALYTICS-1).
 *
 * Deterministic `now` is injected so range windows, daily buckets, and the
 * heatmap are reproducible without a clock or DB.
 */

// 2026-06-17T12:00:00Z — a Wednesday.
const NOW = Date.parse("2026-06-17T12:00:00Z");
const DAY = 86_400_000;

function run(
  partial: Partial<AnalyticsRunRow> & { startedAt: string },
): AnalyticsRunRow {
  return {
    id: partial.id ?? cryptoId(partial.startedAt),
    workflowId: partial.workflowId ?? "wf-1",
    status: partial.status ?? "succeeded",
    startedAt: partial.startedAt,
    finishedAt: partial.finishedAt ?? null,
    isTest: partial.isTest ?? false,
  };
}

// Deterministic uuid-shaped id so the AnalyticsRecentRun schema (uuid) is happy
// where these flow through; here we only assert structure so any stable string
// works, but keep it uuid-like for realism.
let counter = 0;
function cryptoId(seed: string): string {
  counter += 1;
  const n = (counter + seed.length).toString(16).padStart(12, "0");
  return `00000000-0000-0000-0000-${n}`;
}

const baseInput = (
  runs: readonly AnalyticsRunRow[],
  overrides: Partial<BuildOverviewInput> = {},
): BuildOverviewInput => ({
  range: "7d",
  now: NOW,
  runs,
  workflows: [
    { id: "wf-1", name: "Welcome flow", state: "active" },
    { id: "wf-2", name: "Invoice reminders", state: "draft" },
  ],
  apps: [
    { provider: "slack", label: "Slack" },
    { provider: "slack", label: "Slack" },
    { provider: "gmail", label: "Gmail" },
  ],
  truncated: false,
  ...overrides,
});

describe("computeRangeWindow", () => {
  it("derives a 7d window with an equal-length previous window", () => {
    const w = computeRangeWindow("7d", NOW);
    expect(w.until).toBe(NOW);
    expect(w.since).toBe(NOW - 7 * DAY);
    expect(w.prevSince).toBe(NOW - 14 * DAY);
  });

  it("today starts at the UTC day boundary", () => {
    const w = computeRangeWindow("today", NOW);
    expect(w.since).toBe(Date.parse("2026-06-17T00:00:00Z"));
  });

  it("ytd starts at Jan 1 UTC", () => {
    const w = computeRangeWindow("ytd", NOW);
    expect(w.since).toBe(Date.parse("2026-01-01T00:00:00Z"));
  });
});

describe("analyticsFetchSince", () => {
  it("reaches back far enough to cover both the prev window and the heatmap", () => {
    const since = analyticsFetchSince("7d", NOW);
    // Heatmap needs 16 weeks (>14d), so it dominates the 7d prev window.
    expect(since).toBeLessThanOrEqual(NOW - 16 * 7 * DAY + DAY);
  });
});

describe("buildAnalyticsOverview", () => {
  it("computes totals + success rate over the range, excluding test runs", () => {
    const runs = [
      run({ startedAt: iso(NOW - 1 * DAY), status: "succeeded" }),
      run({ startedAt: iso(NOW - 2 * DAY), status: "succeeded" }),
      run({ startedAt: iso(NOW - 3 * DAY), status: "failed" }),
      run({ startedAt: iso(NOW - 1 * DAY), status: "failed", isTest: true }), // excluded
      run({ startedAt: iso(NOW - 30 * DAY), status: "succeeded" }), // out of 7d range
    ];
    const o = buildAnalyticsOverview(baseInput(runs));
    expect(o.totals.runs).toBe(3);
    expect(o.totals.succeeded).toBe(2);
    expect(o.totals.failed).toBe(1);
    expect(o.totals.successRate).toBeCloseTo(2 / 3, 5);
  });

  it("counts active workflows + connected apps from account context", () => {
    const o = buildAnalyticsOverview(baseInput([]));
    expect(o.totals.activeWorkflows).toBe(1); // only wf-1 is active
    expect(o.totals.totalWorkflows).toBe(2);
    expect(o.totals.connectedApps).toBe(2); // slack + gmail (deduped by provider)
  });

  it("groups apps by provider and counts connections", () => {
    const o = buildAnalyticsOverview(baseInput([]));
    const slack = o.apps.find((a) => a.provider === "slack");
    expect(slack).toEqual({ provider: "slack", label: "Slack", connections: 2 });
  });

  it("ranks workflows by run count desc", () => {
    const runs = [
      run({ workflowId: "wf-2", startedAt: iso(NOW - 1 * DAY) }),
      run({ workflowId: "wf-2", startedAt: iso(NOW - 1 * DAY) }),
      run({ workflowId: "wf-1", startedAt: iso(NOW - 1 * DAY) }),
    ];
    const o = buildAnalyticsOverview(baseInput(runs));
    expect(o.workflows.map((w) => w.workflowId)).toEqual(["wf-2", "wf-1"]);
    expect(o.workflows[0]?.runs).toBe(2);
    expect(o.workflows[0]?.name).toBe("Invoice reminders");
  });

  it("computes average duration over finished runs only", () => {
    const runs = [
      run({ startedAt: iso(NOW - 1 * DAY), finishedAt: iso(NOW - 1 * DAY + 100) }),
      run({ startedAt: iso(NOW - 1 * DAY), finishedAt: iso(NOW - 1 * DAY + 300) }),
      run({ startedAt: iso(NOW - 1 * DAY), finishedAt: null }), // ignored
    ];
    const o = buildAnalyticsOverview(baseInput(runs));
    expect(o.totals.avgDurationMs).toBe(200);
  });

  it("builds a contiguous daily runs-over-time series (no gaps)", () => {
    const runs = [run({ startedAt: iso(NOW - 1 * DAY) })];
    const o = buildAnalyticsOverview(baseInput(runs));
    // 7d window → ~8 daily buckets, all present and sorted ascending.
    expect(o.runsOverTime.length).toBeGreaterThanOrEqual(7);
    const dates = o.runsOverTime.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("lays runs into the 16-week heatmap and sums totals", () => {
    const runs = [
      run({ startedAt: iso(NOW - 1 * DAY) }),
      run({ startedAt: iso(NOW - 1 * DAY) }),
      run({ startedAt: iso(NOW - 8 * DAY) }),
    ];
    const o = buildAnalyticsOverview(baseInput(runs));
    expect(o.heatmap.weeks).toBe(16);
    expect(o.heatmap.cells.length).toBe(16 * 7);
    expect(o.heatmap.total).toBe(3);
    expect(o.heatmap.maxCell).toBe(2);
  });

  it("computes previous-window totals for trend", () => {
    const runs = [
      run({ startedAt: iso(NOW - 1 * DAY) }), // in range
      run({ startedAt: iso(NOW - 10 * DAY) }), // in prev 7d window (7..14d ago)
      run({ startedAt: iso(NOW - 11 * DAY) }),
    ];
    const o = buildAnalyticsOverview(baseInput(runs));
    expect(o.totals.runs).toBe(1);
    expect(o.previousTotals.runs).toBe(2);
  });

  it("returns recent runs newest-first capped at 8", () => {
    const runs = Array.from({ length: 12 }, (_, i) =>
      run({ startedAt: iso(NOW - (i + 1) * 3600_000), workflowId: "wf-1" }),
    );
    const o = buildAnalyticsOverview(baseInput(runs));
    expect(o.recentRuns.length).toBe(8);
    expect(o.recentRuns[0]?.workflowName).toBe("Welcome flow");
  });

  it("passes through the truncated flag", () => {
    const o = buildAnalyticsOverview(baseInput([], { truncated: true }));
    expect(o.truncated).toBe(true);
  });
});

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
