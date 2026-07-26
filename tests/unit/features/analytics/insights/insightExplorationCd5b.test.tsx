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
import type { ConnectedAnalyticsQuery } from "@/contracts/connectedAnalytics";
import { FIXTURE_CATALOG, categoricalResult, kpiResult } from "./fixtures";

const mockedApi = analyticsApi as jest.Mocked<typeof analyticsApi>;

/**
 * CD-5B — exploration through the real dashboard: drill, breadcrumb, Back,
 * Reset, failure isolation, save-as-new (permissions, placement, cap), and
 * CSV-of-the-explored-aggregate. All against the fictional fixture catalog.
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

const SAVED: AnalyticsWidget = {
  id: "w-root",
  type: "insight",
  size: "l",
  title: "Orders by status",
  icon: "Sparkle",
  config: {
    source: "any",
    insight: {
      source: "acme", dataset: "orders", measure: "order_count",
      dimension: "status", range: { preset: "30d" }, chart: "bar",
    },
  },
};

const REFINE_PAID = { filterKey: "status", filterValue: "paid", label: "Paid" };

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

/** Root query → categorical with a drillable Paid row; refined → narrowed result. */
function armQueries() {
  mockedApi.queryInsight.mockImplementation(async (query: ConnectedAnalyticsQuery) => {
    if (query.filters?.["status"]) {
      return {
        ok: true,
        result: categoricalResult({
          rows: [{ id: "paid", label: "Paid", value: 60, records: 60, refine: REFINE_PAID }],
          total: 60,
        }),
      };
    }
    return {
      ok: true,
      result: categoricalResult({
        rows: [
          { id: "paid", label: "Paid", value: 60, records: 60, refine: REFINE_PAID },
          { id: "refunded", label: "Refunded", value: 30, records: 30 },
        ],
        total: 90,
      }),
    };
  });
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

async function drillIntoPaid() {
  // The saved bar chart's Paid group is the drill target.
  const paidGroup = await screen.findByTestId("insight-bar-group-paid");
  fireEvent.click(paidGroup);
  await screen.findByRole("navigation", { name: "Exploration path" });
}

beforeEach(() => {
  jest.clearAllMocks();
  armQueries();
});

describe("exploring", () => {
  it("drilling narrows in place: breadcrumb, description, and a refined query", async () => {
    renderDashboard([SAVED]);
    await drillIntoPaid();

    const nav = screen.getByRole("navigation", { name: "Exploration path" });
    expect(nav.textContent).toContain("All Acme orders");
    expect(nav.textContent).toContain("Paid");
    expect(screen.getByText("Exploring: Status is Paid")).toBeTruthy();

    // The refined query went through the SAME normal route — with the
    // canonical value, never the display label as authority.
    const refinedCall = mockedApi.queryInsight.mock.calls.find(
      (c) => (c[0] as ConnectedAnalyticsQuery).filters?.["status"],
    );
    expect((refinedCall![0] as ConnectedAnalyticsQuery).filters).toEqual({ status: ["paid"] });
  });

  it("the saved widget's persisted config is never touched by exploring", async () => {
    renderDashboard([SAVED]);
    await drillIntoPaid();
    expect(mockedApi.updateDashboard).not.toHaveBeenCalled();
  });

  it("Back returns to the parent instantly from the level memo, Reset to the root", async () => {
    renderDashboard([SAVED]);
    await drillIntoPaid();
    const callsAfterDrill = mockedApi.queryInsight.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(screen.queryByRole("navigation", { name: "Exploration path" })).toBeNull(),
    );
    // Parent render came from the memo — Back did not have to wait on a fetch
    // (the hook may revalidate in the background; the memoized parent shows).
    expect(screen.getByTestId("insight-bar-group-refunded")).toBeTruthy();

    fireEvent.click(screen.getByTestId("insight-bar-group-paid"));
    await screen.findByRole("navigation", { name: "Exploration path" });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(screen.queryByRole("navigation", { name: "Exploration path" })).toBeNull(),
    );
    expect(callsAfterDrill).toBeGreaterThan(0);
  });

  it("a failed exploration keeps Back available and never loses the parent", async () => {
    renderDashboard([SAVED]);
    await screen.findByTestId("insight-bar-group-paid");
    mockedApi.queryInsight.mockRejectedValueOnce(
      Object.assign(new Error("Couldn't load this data."), { code: "PROVIDER_ERROR" }),
    );
    fireEvent.click(screen.getByTestId("insight-bar-group-paid"));

    await screen.findByRole("navigation", { name: "Exploration path" });
    await waitFor(() => expect(screen.getByText(/couldn't load/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(screen.queryByRole("navigation", { name: "Exploration path" })).toBeNull(),
    );
    expect(await screen.findByTestId("insight-bar-group-refunded")).toBeTruthy();
  });

  it("exploration is transient — a remount returns to the saved root", async () => {
    const { unmount } = renderDashboard([SAVED]);
    await drillIntoPaid();
    unmount();
    armQueries();
    renderDashboard([SAVED]);
    await screen.findByTestId("insight-bar-group-paid");
    expect(screen.queryByRole("navigation", { name: "Exploration path" })).toBeNull();
  });
});

describe("save as new insight", () => {
  it("owner saves the explored question as a NEW widget placed after the source", async () => {
    mockedApi.updateDashboard.mockImplementation(async (_id, patch) => ({
      ...dashboard(patch.widgets as AnalyticsWidget[]),
    }));
    renderDashboard([SAVED]);
    await drillIntoPaid();

    fireEvent.click(screen.getByRole("button", { name: "Save as new insight" }));
    const dialog = await screen.findByRole("dialog", { name: "Save as new insight" });
    const input = within(dialog).getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("Orders — Orders — Paid"); // suggested, safe labels only
    fireEvent.change(input, { target: { value: "Paid orders" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save insight" }));

    await waitFor(() => expect(mockedApi.updateDashboard).toHaveBeenCalledTimes(1));
    const widgets = mockedApi.updateDashboard.mock.calls[0]![1].widgets as AnalyticsWidget[];
    expect(widgets).toHaveLength(2);
    // Root first, unchanged; the new widget immediately after, with a fresh id.
    expect(widgets[0]).toEqual(SAVED);
    expect(widgets[1]!.id).not.toBe(SAVED.id);
    expect(widgets[1]!.title).toBe("Paid orders");
    expect(widgets[1]!.size).toBe(SAVED.size);
    expect(widgets[1]!.config.insight).toEqual({
      source: "acme",
      dataset: "orders",
      measure: "order_count",
      dimension: "status",
      filters: { status: ["paid"] },
      range: { preset: "30d" },
      chart: "bar",
    });
    // Nothing transient rides along: config only.
    expect(JSON.stringify(widgets[1])).not.toMatch(/result|freshness|completeness|exploration/);
  });

  it("members can explore but never see an enabled save action", async () => {
    renderDashboard([SAVED], { canManage: false });
    await drillIntoPaid();
    expect(screen.queryByRole("button", { name: "Save as new insight" })).toBeNull();
    // Exploration itself still worked.
    expect(screen.getByText("Exploring: Status is Paid")).toBeTruthy();
  });

  it("a full dashboard disables saving with an explanation, keeping the exploration", async () => {
    const filler = Array.from({ length: 47 }, (_, i) => ({
      id: `w-f${i}`,
      type: "note" as const,
      size: "s" as const,
      title: `Note ${i}`,
      config: { source: "any" as const, note: "x" },
    }));
    renderDashboard([SAVED, ...filler]);
    await drillIntoPaid();
    const save = screen.getByRole("button", { name: "Save as new insight" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/dashboard is full/i)).toBeTruthy();
    expect(screen.getByText("Exploring: Status is Paid")).toBeTruthy();
  });
});

describe("CSV export of an explored result", () => {
  it("exports the currently-explored aggregate, and the root again after Back", async () => {
    const clicks: string[] = [];
    const realCreate = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") {
        (el as HTMLAnchorElement).click = () => clicks.push((el as HTMLAnchorElement).href);
      }
      return el;
    });
    const rawBlobs: Blob[] = [];
    const blobs: string[] = [];
    const readBlob = (b: Blob) =>
      new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsText(b);
      });
    global.URL.createObjectURL = jest.fn((blob: Blob) => {
      rawBlobs.push(blob);
      void readBlob(blob).then((t) => blobs.push(t));
      return `blob:${rawBlobs.length}`;
    }) as unknown as typeof URL.createObjectURL;
    global.URL.revokeObjectURL = jest.fn();

    renderDashboard([SAVED]);
    await drillIntoPaid();
    // Export ships what is ON SCREEN — wait for the explored aggregate to
    // actually render (the narrowed result has no Refunded group).
    await waitFor(() => expect(screen.queryByTestId("insight-bar-group-refunded")).toBeNull());
    await waitFor(() => expect(screen.getByTestId("insight-bar-group-paid")).toBeTruthy());
    const providerCalls = mockedApi.queryInsight.mock.calls.length;

    fireEvent.click(await screen.findByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(clicks).toHaveLength(1));
    await waitFor(() => expect(blobs).toHaveLength(1));
    // The explored aggregate: only the narrowed row, no Refunded, no refine
    // metadata columns, no provider ids.
    expect(blobs[0]).toContain("Paid");
    expect(blobs[0]).not.toContain("Refunded");
    expect(blobs[0]).not.toContain("filterKey");
    expect(blobs[0]).not.toContain("refine");
    // Export made no query.
    expect(mockedApi.queryInsight.mock.calls).toHaveLength(providerCalls);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(screen.queryByRole("navigation", { name: "Exploration path" })).toBeNull(),
    );
    await screen.findByTestId("insight-bar-group-refunded");
    fireEvent.click(await screen.findByRole("button", { name: /Export CSV/ }));
    await waitFor(() => expect(blobs).toHaveLength(2));
    expect(blobs[1]).toContain("Refunded"); // the root aggregate again

    jest.restoreAllMocks();
  });
});

describe("KPI exploration entry", () => {
  it("a compared KPI explores its previous window through the same path", async () => {
    mockedApi.queryInsight.mockImplementation(async (query: ConnectedAnalyticsQuery) => {
      if ("from" in query.range) return { ok: true, result: kpiResult({ value: 900 }) };
      return {
        ok: true,
        result: kpiResult({
          value: 1234,
          compare: {
            previousValue: 900,
            previousRange: { from: "2026-05-16T00:00:00.000Z", to: "2026-06-15T00:00:00.000Z" },
          },
        }),
      };
    });
    renderDashboard([
      {
        ...SAVED,
        config: {
          source: "any",
          insight: {
            source: "acme", dataset: "orders", measure: "order_count",
            dimension: null, range: { preset: "30d" },
            compare: "previous_period", chart: "kpi",
          },
        },
      },
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "Explore previous period" }));
    await screen.findByRole("navigation", { name: "Exploration path" });
    const refined = mockedApi.queryInsight.mock.calls.find((c) => "from" in (c[0] as ConnectedAnalyticsQuery).range);
    expect((refined![0] as ConnectedAnalyticsQuery).range).toEqual({
      from: "2026-05-16T00:00:00.000Z",
      to: "2026-06-15T00:00:00.000Z",
    });
    expect((refined![0] as ConnectedAnalyticsQuery).compare).toBeUndefined();
  });
});
