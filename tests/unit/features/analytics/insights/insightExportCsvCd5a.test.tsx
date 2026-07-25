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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
 * CD-5A — per-widget CSV export, driven through the real dashboard.
 *
 * The security claim under test: export is a purely LOCAL projection of the
 * result already on screen, so clicking it issues no query and therefore cannot
 * re-hit a provider, spend the rate limiter, or mutate the snapshot cache.
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
  workflows: [],
  apps: [],
  heatmap: { weeks: 1, cells: [0, 0, 0, 0, 0, 0, 0], maxCell: 0, total: 0 },
  recentRuns: [],
  truncated: false,
};

const SAVED_INSIGHT: AnalyticsWidget = {
  id: "w-ins",
  type: "insight",
  size: "m",
  title: "Monthly orders",
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

/** Captures the anchor the exporter builds, without a real download. */
function captureDownload(): { clicks: { download: string }[] } {
  const clicks: { download: string }[] = [];
  const realCreate = document.createElement.bind(document);
  jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = realCreate(tag);
    if (tag === "a") {
      (el as HTMLAnchorElement).click = () => {
        clicks.push({ download: (el as HTMLAnchorElement).download });
      };
    }
    return el;
  });
  return { clicks };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.queryInsight.mockResolvedValue({ ok: true, result: kpiResult() });
  global.URL.createObjectURL = jest.fn(() => "blob:mock");
  global.URL.revokeObjectURL = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("export action availability", () => {
  it("appears on a saved Insight once it has data, named for the widget", async () => {
    renderDashboard([SAVED_INSIGHT]);
    expect(
      await screen.findByRole("button", { name: "Export CSV: Monthly orders" }),
    ).toBeTruthy();
  });

  it("is offered to read-only members, who can already see the data", async () => {
    renderDashboard([SAVED_INSIGHT], { canManage: false });
    expect(
      await screen.findByRole("button", { name: "Export CSV: Monthly orders" }),
    ).toBeTruthy();
  });

  it("is absent while the widget has no result yet", async () => {
    mockedApi.queryInsight.mockReturnValue(new Promise(() => {}));
    renderDashboard([SAVED_INSIGHT]);
    await waitFor(() => expect(mockedApi.queryInsight).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Export CSV/ })).toBeNull();
  });

  it("is not offered on a legacy non-Insight widget", async () => {
    renderDashboard([STAT_WIDGET]);
    await waitFor(() => expect(screen.getByText("Runs")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Export CSV/ })).toBeNull();
  });
});

describe("exporting", () => {
  it("downloads a dated .csv named from the source, dataset and widget title", async () => {
    const { clicks } = captureDownload();
    renderDashboard([SAVED_INSIGHT]);
    fireEvent.click(await screen.findByRole("button", { name: /Export CSV/ }));

    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(clicks[0]!.download).toMatch(/^acme-orders-monthly-orders-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("announces success without an alert", async () => {
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    captureDownload();
    renderDashboard([SAVED_INSIGHT]);
    fireEvent.click(await screen.findByRole("button", { name: /Export CSV/ }));

    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((n) => n.textContent === "CSV downloaded."),
      ).toBe(true),
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("makes NO query — no provider call, no limiter spend, no cache write", async () => {
    captureDownload();
    renderDashboard([SAVED_INSIGHT]);
    await screen.findByRole("button", { name: /Export CSV/ });
    const before = mockedApi.queryInsight.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((n) => /CSV/.test(n.textContent ?? ""))).toBe(
        true,
      ),
    );

    expect(mockedApi.queryInsight.mock.calls).toHaveLength(before);
  });

  it("still exports partial data, and says the file records that", async () => {
    mockedApi.queryInsight.mockResolvedValue({
      ok: true,
      result: kpiResult({
        completeness: { state: "scan_capped", detail: "First 2000 orders." },
      }),
    });
    const { clicks } = captureDownload();
    renderDashboard([SAVED_INSIGHT]);
    fireEvent.click(await screen.findByRole("button", { name: /Export CSV/ }));

    await waitFor(() => expect(clicks).toHaveLength(1)); // never blocked
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .some((n) => /partial or cached/i.test(n.textContent ?? "")),
      ).toBe(true),
    );
  });

  it("reports a safe message when the download itself fails", async () => {
    renderDashboard([SAVED_INSIGHT]);
    await screen.findByRole("button", { name: /Export CSV/ });
    (global.URL.createObjectURL as jest.Mock).mockImplementation(() => {
      throw new Error("blob blocked");
    });

    fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .some((n) => n.textContent === "Couldn't create the CSV."),
      ).toBe(true),
    );
  });
});

describe("the dashboard's own export is unchanged", () => {
  it("keeps the dashboard JSON export alongside, distinctly labelled", async () => {
    renderDashboard([SAVED_INSIGHT]);
    await screen.findByRole("button", { name: /Export CSV/ });
    // Dashboard export saves CONFIGURATION as JSON; the widget action saves
    // DATA as CSV. Both exist, and their names do not collide.
    expect(screen.getByTitle(/Download this dashboard \+ its data as JSON/i)).toBeTruthy();
  });
});
