jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: import("react").ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/lib/api/analytics", () => ({
  AnalyticsApiError: class AnalyticsApiError extends Error {},
  getAnalyticsData: jest.fn(),
  updateDashboard: jest.fn(),
  createDashboard: jest.fn(),
  deleteDashboard: jest.fn(),
  listDashboards: jest.fn(),
  querySourceData: jest.fn(),
  queryInsight: jest.fn(),
}));
jest.mock("@/lib/api/options", () => ({ fetchOptionsSource: jest.fn() }));

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as analyticsApi from "@/lib/api/analytics";
import { AnalyticsDashboard } from "@/features/analytics/AnalyticsDashboard";
import type {
  AnalyticsDashboard as Dashboard,
  AnalyticsOverview,
  AnalyticsWidget,
} from "@/contracts/analytics";
import { FIXTURE_CATALOG, kpiResult } from "./fixtures";

const mockedApi = analyticsApi as jest.Mocked<typeof analyticsApi>;

/**
 * Custom Insight ↔ dashboard lifecycle (CD-3A): add from the library,
 * configure through the insight panel, save through the normal atomic PATCH,
 * reload from persisted config, member read-only, existing widgets untouched.
 */

const OVERVIEW: AnalyticsOverview = {
  range: { id: "7d", since: "2026-07-18", until: "2026-07-25" },
  totals: {
    runs: 10, succeeded: 9, failed: 1, successRate: 0.9, avgDurationMs: 100,
    activeWorkflows: 2, totalWorkflows: 3, connectedApps: 1,
  },
  previousTotals: {
    runs: 8, succeeded: 8, failed: 0, successRate: 1, avgDurationMs: 90,
    activeWorkflows: 2, totalWorkflows: 3, connectedApps: 1,
  },
  runsOverTime: [],
  workflows: [
    {
      workflowId: "9d8f34a1-0000-4000-8000-000000000001",
      name: "Daily digest",
      runs: 5, succeeded: 5, successRate: 1, avgDurationMs: 80,
    },
  ],
  apps: [],
  heatmap: { weeks: 1, cells: [0, 0, 0, 0, 0, 0, 0], maxCell: 0, total: 0 },
  recentRuns: [],
  truncated: false,
};

const SAVED_INSIGHT: AnalyticsWidget = {
  id: "w-ins",
  type: "insight",
  size: "m",
  title: "Orders",
  icon: "Sparkle",
  config: {
    source: "any",
    insight: {
      source: "acme", dataset: "orders", measure: "order_count",
      dimension: null, range: { preset: "30d" }, chart: "kpi",
    },
  },
};

const STAT_WIDGET: AnalyticsWidget = {
  id: "w-stat",
  type: "stat",
  size: "s",
  title: "Runs",
  config: { source: "any", metric: "runs" },
};

function dashboard(widgets: AnalyticsWidget[]): Dashboard {
  return {
    id: "3f8f34a1-0000-4000-8000-00000000000d",
    name: "Overview",
    position: 0,
    isDefault: true,
    widgets,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}

function renderDashboard(widgets: AnalyticsWidget[], opts: { canManage?: boolean } = {}) {
  return render(
    <AnalyticsDashboard
      accountName="Acme Co"
      canManage={opts.canManage ?? true}
      connectedProviders={{ acme: true }}
      insightCatalog={FIXTURE_CATALOG}
      initialDashboards={[dashboard(widgets)]}
      initialOverview={OVERVIEW}
      initialRange="7d"
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.queryInsight.mockResolvedValue({ ok: true, result: kpiResult() });
});

describe("insight ↔ dashboard integration", () => {
  it("a persisted insight widget loads its data on reload; existing widgets render untouched", async () => {
    renderDashboard([STAT_WIDGET, SAVED_INSIGHT]);
    await waitFor(() => expect(screen.getByText("1,234")).toBeTruthy());
    expect(mockedApi.queryInsight).toHaveBeenCalledTimes(1);
    // The legacy stat widget still renders from the overview.
    const stat = screen.getByTestId("analytics-widget-w-stat");
    expect(within(stat).getByText("Runs")).toBeTruthy();
    // Insight widgets show their own freshness, not the dashboard range pill.
    const insight = screen.getByTestId("analytics-widget-w-ins");
    expect(within(insight).queryByText("7 days")).toBeNull();
  });

  it("add → configure → apply → Done editing saves through one atomic PATCH", async () => {
    mockedApi.updateDashboard.mockImplementation(async (_id, patch) => ({
      ...dashboard((patch.widgets ?? []) as AnalyticsWidget[]),
    }));
    renderDashboard([STAT_WIDGET]);

    fireEvent.click(screen.getByRole("button", { name: /Edit dashboard/ }));
    // Edit mode offers "Add a widget" in the banner and as a grid tile.
    fireEvent.click(screen.getAllByRole("button", { name: /Add a widget/ })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Custom insight/ }));

    // The insight config panel opens (not the legacy metric panel).
    expect(screen.getByRole("dialog", { name: "Configure custom insight" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Acme/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Orders Orders placed/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Orders" }));
    fireEvent.click(screen.getByRole("button", { name: "No grouping — one number" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    fireEvent.click(screen.getByRole("button", { name: /Done editing/ }));
    await waitFor(() => expect(mockedApi.updateDashboard).toHaveBeenCalledTimes(1));
    const patch = mockedApi.updateDashboard.mock.calls[0]![1];
    const widgets = patch.widgets as AnalyticsWidget[];
    expect(widgets).toHaveLength(2);
    const saved = widgets[1]!;
    expect(saved.type).toBe("insight");
    expect(saved.config.insight).toEqual({
      source: "acme",
      dataset: "orders",
      measure: "order_count",
      dimension: null,
      range: { preset: "30d" },
      chart: "kpi",
    });
  });

  it("editing an existing insight opens ITS panel with the saved question", async () => {
    renderDashboard([SAVED_INSIGHT]);
    fireEvent.click(screen.getByRole("button", { name: /Edit dashboard/ }));
    fireEvent.click(screen.getByRole("button", { name: "Configure widget" }));
    const dialog = screen.getByRole("dialog", { name: "Configure custom insight" });
    expect(within(dialog).getByRole("button", { name: "Orders" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("remove works through the normal draft lifecycle", async () => {
    renderDashboard([SAVED_INSIGHT]);
    fireEvent.click(screen.getByRole("button", { name: /Edit dashboard/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove widget" }));
    expect(screen.queryByTestId("analytics-widget-w-ins")).toBeNull();
  });

  it("members (read-only) see insight data but no edit controls", async () => {
    renderDashboard([SAVED_INSIGHT], { canManage: false });
    await waitFor(() => expect(screen.getByText("1,234")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Edit dashboard/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Configure widget" })).toBeNull();
  });
});
