"use client";

import type {
  AnalyticsDashboard as Dashboard,
  AnalyticsOverview,
  AnalyticsWidget,
} from "@/contracts/analytics";
import { DEFAULT_OVERVIEW_WIDGETS } from "@/contracts/analyticsDefaults";
import { AnalyticsDashboard } from "../AnalyticsDashboard";

/**
 * In-memory mount of the REAL AnalyticsDashboard for browser drag tests
 * (ANALYTICS-DRAG-RIGHTWARD-CAPTURE-LOSS-1). Rendered only by the hard-gated
 * `/__e2e-drag-harness` route — see that file for why this exists and why it
 * cannot be reached in production.
 *
 * Everything here is fixture data. The widgets are all `stat` type so the grid
 * renders straight from `initialOverview` and issues no network request, which
 * keeps the harness honest: any drag failure is the drag, not a missing API.
 *
 * The offset wrapper is deliberate — it reproduces the real page's sidebar and
 * header offsets so viewport and grid-local coordinates are NOT interchangeable,
 * the condition under which the previous coordinate bug hid.
 */

const OVERVIEW: AnalyticsOverview = {
  range: { id: "7d", since: "2026-07-21", until: "2026-07-28" },
  totals: {
    runs: 42, succeeded: 40, failed: 2, successRate: 0.95, avgDurationMs: 1200,
    activeWorkflows: 3, totalWorkflows: 5, connectedApps: 2,
  },
  previousTotals: {
    runs: 30, succeeded: 29, failed: 1, successRate: 0.97, avgDurationMs: 1100,
    activeWorkflows: 3, totalWorkflows: 5, connectedApps: 2,
  },
  runsOverTime: [],
  workflows: [],
  apps: [],
  heatmap: { weeks: 1, cells: [0, 0, 0, 0, 0, 0, 0], maxCell: 0, total: 0 },
  recentRuns: [],
  truncated: false,
};

const widget = (
  id: string,
  title: string,
  size: AnalyticsWidget["size"],
  layout: { x: number; y: number; w: number; h: number },
): AnalyticsWidget => ({
  id,
  type: "stat",
  size,
  title,
  config: { source: "any", metric: "runs" },
  layout,
});

/**
 * A board with EXPLICIT placement, mixed footprints and a deliberate hole
 * (ANALYTICS-EXPLICIT-LAYOUT-S4-EDITOR-INTEGRATION-1):
 *
 *   row 0:  alpha(1x1) | bravo(1x1) |    ·    | delta(1x1)
 *   row 1:  charlie(2x1)            | echo(2x2)
 *   row 2:            ·             | echo
 *
 * Column 2 of row 0 is empty ON PURPOSE — it is the cell the old editor could
 * never target, and the one these browser tests drop a widget into.
 */
const WIDGETS: AnalyticsWidget[] = [
  widget("w-alpha", "Alpha", "s", { x: 0, y: 0, w: 1, h: 1 }),
  widget("w-bravo", "Bravo", "s", { x: 1, y: 0, w: 1, h: 1 }),
  widget("w-delta", "Delta", "s", { x: 3, y: 0, w: 1, h: 1 }),
  widget("w-charlie", "Charlie", "m", { x: 0, y: 1, w: 2, h: 1 }),
  widget("w-echo", "Echo", "l", { x: 2, y: 1, w: 2, h: 2 }),
];

const DASHBOARD: Dashboard = {
  id: "00000000-0000-4000-8000-000000000e2e",
  name: "Harness",
  position: 0,
  isDefault: true,
  widgets: WIDGETS,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

/**
 * The CHART board (ANALYTICS-RESPONSIVE-CHART-SURFACES-1).
 *
 * Every supported footprint appears at least once, with real chart data behind
 * it, so Chromium can assert that each visualization fits the body it was given
 * at 1×1, 2×1, 3×1, 4×1, 1×2 and 2×2 — the sizes the fixed-dimension charts used
 * to be wrong at. The `runsOverTime` series carries a deliberate spike: a peak
 * clipped by the card is the exact defect this board exists to catch.
 */
const CHART_OVERVIEW: AnalyticsOverview = {
  range: { id: "30d", since: "2026-06-28", until: "2026-07-28" },
  totals: {
    runs: 1843, succeeded: 1810, failed: 33, successRate: 1810 / 1843, avgDurationMs: 1420,
    activeWorkflows: 6, totalWorkflows: 9, connectedApps: 4,
  },
  previousTotals: {
    runs: 1562, succeeded: 1500, failed: 62, successRate: 1500 / 1562, avgDurationMs: 1610,
    activeWorkflows: 5, totalWorkflows: 9, connectedApps: 4,
  },
  runsOverTime: Array.from({ length: 24 }, (_, i) => ({
    date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
    // One dominant spike, so a chart that clips its top is visibly wrong.
    succeeded: i === 13 ? 480 : 30 + ((i * 17) % 60),
    failed: i === 5 ? 40 : i % 4,
  })),
  workflows: [
    { workflowId: "11111111-1111-1111-1111-111111111111", name: "Welcome flow for brand-new signups", runs: 900, succeeded: 880, successRate: 880 / 900, avgDurationMs: 1200 },
    { workflowId: "22222222-2222-2222-2222-222222222222", name: "Nightly CRM sync", runs: 420, succeeded: 410, successRate: 410 / 420, avgDurationMs: 2200 },
    { workflowId: "33333333-3333-3333-3333-333333333333", name: "Invoice chase", runs: 260, succeeded: 250, successRate: 250 / 260, avgDurationMs: 900 },
    { workflowId: "44444444-4444-4444-4444-444444444444", name: "Lead router", runs: 150, succeeded: 148, successRate: 148 / 150, avgDurationMs: 700 },
    { workflowId: "55555555-5555-5555-5555-555555555555", name: "Weekly digest mailer", runs: 80, succeeded: 79, successRate: 79 / 80, avgDurationMs: 500 },
    { workflowId: "66666666-6666-6666-6666-666666666666", name: "Support triage", runs: 33, succeeded: 30, successRate: 30 / 33, avgDurationMs: 400 },
  ],
  apps: [
    { provider: "slack", label: "Slack", connections: 4 },
    { provider: "google-sheets", label: "Google Sheets", connections: 3 },
    { provider: "hubspot", label: "HubSpot", connections: 2 },
    { provider: "outlook", label: "Microsoft Outlook", connections: 1 },
  ],
  heatmap: {
    weeks: 16,
    cells: Array.from({ length: 16 * 7 }, (_, i) => (i * 7) % 9),
    maxCell: 8,
    total: 1843,
  },
  recentRuns: Array.from({ length: 8 }, (_, i) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${i}`,
    workflowName: i % 2 === 0 ? "Welcome flow for brand-new signups" : "Nightly CRM sync",
    status: (i === 3 ? "failed" : "succeeded") as "failed" | "succeeded",
    startedAt: "2026-07-28T09:00:00Z",
    durationMs: 800 + i * 120,
  })),
  truncated: false,
};

const chartWidget = (
  id: string,
  type: AnalyticsWidget["type"],
  size: AnalyticsWidget["size"],
  title: string,
  layout: { x: number; y: number; w: number; h: number },
  metric: NonNullable<AnalyticsWidget["config"]["metric"]> = "runs",
): AnalyticsWidget => ({
  id,
  type,
  size,
  title,
  config: { source: "any", metric },
  layout,
});

const CHART_WIDGETS: AnalyticsWidget[] = [
  chartWidget("c-line-2x1", "line", "m", "Runs over time", { x: 0, y: 0, w: 2, h: 1 }),
  chartWidget("c-donut-2x1", "donut", "m", "By outcome", { x: 2, y: 0, w: 2, h: 1 }),
  chartWidget("c-heat-3x1", "heatmap", "xl", "When your automations run", { x: 0, y: 1, w: 3, h: 1 }),
  chartWidget("c-stat-1x2", "stat", "tall", "Total runs", { x: 3, y: 1, w: 1, h: 2 }),
  chartWidget("c-bar-2x1", "bar", "m", "Top automations by runs", { x: 0, y: 2, w: 2, h: 1 }, "top_workflows"),
  chartWidget("c-line-1x1", "line", "s", "Runs (small)", { x: 2, y: 2, w: 1, h: 1 }),
  chartWidget("c-heat-2x2", "heatmap", "l", "Activity (large)", { x: 0, y: 3, w: 2, h: 2 }),
  chartWidget("c-donut-1x1", "donut", "s", "Outcome (small)", { x: 2, y: 3, w: 1, h: 1 }),
  chartWidget("c-bar-1x1", "bar", "s", "Connected apps", { x: 3, y: 3, w: 1, h: 1 }, "by_app"),
  chartWidget("c-line-1x2", "line", "tall", "Runs (tall)", { x: 2, y: 4, w: 1, h: 2 }),
  chartWidget("c-donut-2x2", "donut", "l", "Outcome (large)", { x: 0, y: 5, w: 2, h: 2 }),
  chartWidget("c-bar-4x1", "bar", "w", "Automations (full width)", { x: 0, y: 7, w: 4, h: 1 }, "top_workflows"),
  chartWidget("c-line-3x1", "line", "xl", "Runs (wide)", { x: 0, y: 8, w: 3, h: 1 }),
  chartWidget("c-stat-1x1", "stat", "s", "Success rate", { x: 3, y: 8, w: 1, h: 1 }, "success_rate"),
];

const CHART_DASHBOARD: Dashboard = {
  id: "00000000-0000-4000-8000-00000000c4a2",
  name: "Charts",
  position: 0,
  isDefault: true,
  widgets: CHART_WIDGETS,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

/**
 * The REAL default Overview board (ANALYTICS-DEFAULT-OVERVIEW-WELCOME-FIRST-1).
 *
 * `DEFAULT_OVERVIEW_WIDGETS` verbatim — the same value the server seeds and the
 * same LEGACY form (no `layout`), so the browser exercises the actual derivation
 * a brand-new account gets, not a fixture that merely resembles it. Importing the
 * constant rather than copying it is the point: a reorder cannot pass here while
 * failing in production.
 */
const DEFAULT_DASHBOARD: Dashboard = {
  id: "00000000-0000-4000-8000-00000000de4a",
  name: "Overview",
  position: 0,
  isDefault: true,
  // Spread only to satisfy the mutable contract type — the CONTENT and ORDER are
  // the shipped constant's, which is what this fixture exists to exercise.
  widgets: [...DEFAULT_OVERVIEW_WIDGETS],
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

export type AnalyticsHarnessBoard = "drag" | "charts" | "default";

const BOARDS: Record<
  AnalyticsHarnessBoard,
  { dashboard: Dashboard; overview: AnalyticsOverview; range: "7d" | "30d" }
> = {
  drag: { dashboard: DASHBOARD, overview: OVERVIEW, range: "7d" },
  charts: { dashboard: CHART_DASHBOARD, overview: CHART_OVERVIEW, range: "30d" },
  // Real data behind the real default inventory, so every widget renders.
  default: { dashboard: DEFAULT_DASHBOARD, overview: CHART_OVERVIEW, range: "30d" },
};

export function AnalyticsDragHarness({ board = "drag" }: { board?: AnalyticsHarnessBoard }) {
  const { dashboard, overview, range } = BOARDS[board];
  return (
    <div style={{ display: "flex" }}>
      {/* Stand-ins for the app shell's sidebar and header, so the grid sits
          well away from the viewport origin exactly as it does in the app. */}
      <div style={{ width: 248, height: "100vh", flex: "none" }} aria-hidden="true" />
      <div style={{ flex: 1, padding: 24, minWidth: 0 }}>
        <div style={{ height: 96 }} aria-hidden="true" />
        <AnalyticsDashboard
          accountName="Harness Co"
          canManage
          connectedProviders={{}}
          insightCatalog={{ sources: [] }}
          initialDashboards={[dashboard]}
          initialOverview={overview}
          initialRange={range}
        />
      </div>
    </div>
  );
}
