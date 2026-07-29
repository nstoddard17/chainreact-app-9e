"use client";

import type {
  AnalyticsDashboard as Dashboard,
  AnalyticsOverview,
  AnalyticsWidget,
} from "@/contracts/analytics";
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

const widget = (id: string, title: string): AnalyticsWidget => ({
  id,
  type: "stat",
  size: "s",
  title,
  config: { source: "any", metric: "runs" },
});

const WIDGETS: AnalyticsWidget[] = [
  widget("w-alpha", "Alpha"),
  widget("w-bravo", "Bravo"),
  widget("w-charlie", "Charlie"),
  widget("w-delta", "Delta"),
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

export function AnalyticsDragHarness() {
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
          initialDashboards={[DASHBOARD]}
          initialOverview={OVERVIEW}
          initialRange="7d"
        />
      </div>
    </div>
  );
}
