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
import { duplicateWidgetAt, MAX_DASHBOARD_WIDGETS } from "@/features/analytics/dashboardHelpers";
import { DEFAULT_OVERVIEW_WIDGETS } from "@/contracts/analyticsDefaults";
import type {
  AnalyticsDashboard as Dashboard,
  AnalyticsOverview,
  AnalyticsWidget,
} from "@/contracts/analytics";
import { FIXTURE_CATALOG, kpiResult } from "./insights/fixtures";

const mockedApi = analyticsApi as jest.Mocked<typeof analyticsApi>;

/**
 * CD-3B dashboard customization: rename, duplicate widget, restore default
 * layout — all owner/admin-only, all through the EXISTING dashboard APIs and
 * the atomic save, and all via real dialogs (no window.prompt/confirm).
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

const STAT: AnalyticsWidget = {
  id: "w-stat",
  type: "stat",
  size: "s",
  title: "Runs",
  config: { source: "any", metric: "runs" },
};

const INSIGHT: AnalyticsWidget = {
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

function dashboard(over: Partial<Dashboard> = {}): Dashboard {
  return {
    id: "3f8f34a1-0000-4000-8000-00000000000d",
    name: "Overview",
    position: 0,
    isDefault: true,
    widgets: [STAT, INSIGHT],
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...over,
  };
}

function renderDashboard(
  opts: { dashboards?: Dashboard[]; canManage?: boolean } = {},
) {
  return render(
    <AnalyticsDashboard
      accountName="Acme Co"
      canManage={opts.canManage ?? true}
      connectedProviders={{ acme: true }}
      insightCatalog={FIXTURE_CATALOG}
      initialDashboards={opts.dashboards ?? [dashboard()]}
      initialOverview={OVERVIEW}
      initialRange="7d"
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.queryInsight.mockResolvedValue({ ok: true, result: kpiResult() });
  mockedApi.updateDashboard.mockImplementation(async (id, patch) => ({
    ...dashboard(),
    id,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.widgets !== undefined ? { widgets: patch.widgets as AnalyticsWidget[] } : {}),
  }));
});

describe("dashboard rename", () => {
  it("prefills the current name and saves through the existing PATCH", async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /Rename/ }));
    const dialog = screen.getByRole("dialog", { name: "Rename dashboard" });
    const input = within(dialog).getByLabelText("Dashboard name") as HTMLInputElement;
    expect(input.value).toBe("Overview");

    fireEvent.change(input, { target: { value: "  Revenue overview  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(mockedApi.updateDashboard).toHaveBeenCalledTimes(1));
    // Trimmed, and only the name is patched.
    expect(mockedApi.updateDashboard.mock.calls[0]![1]).toEqual({ name: "Revenue overview" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: /Revenue overview/ })).toBeTruthy();
  });

  it("rejects an empty/whitespace name without calling the API", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /Rename/ }));
    const dialog = screen.getByRole("dialog", { name: "Rename dashboard" });
    fireEvent.change(within(dialog).getByLabelText("Dashboard name"), {
      target: { value: "   " },
    });
    const save = within(dialog).getByRole("button", { name: "Save name" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(mockedApi.updateDashboard).not.toHaveBeenCalled();
  });

  it("enforces the contract's 80-character cap", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /Rename/ }));
    const input = screen.getByLabelText("Dashboard name") as HTMLInputElement;
    expect(input.maxLength).toBe(80);
  });

  it("cancel leaves the dashboard untouched", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /Rename/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockedApi.updateDashboard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Overview/ })).toBeTruthy();
  });

  it("Escape closes the dialog", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /Rename/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("surfaces an API failure in the dialog and keeps it open", async () => {
    mockedApi.updateDashboard.mockRejectedValueOnce(new Error("Name is required."));
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /Rename/ }));
    const dialog = screen.getByRole("dialog", { name: "Rename dashboard" });
    fireEvent.change(within(dialog).getByLabelText("Dashboard name"), {
      target: { value: "New name" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Name is required."));
    expect(screen.getByRole("dialog", { name: "Rename dashboard" })).toBeTruthy();
  });

  it("members see no rename action", () => {
    renderDashboard({ canManage: false });
    expect(screen.queryByRole("button", { name: /Rename/ })).toBeNull();
  });

  it("creating a dashboard uses the same dialog, not window.prompt", async () => {
    const promptSpy = jest.spyOn(window, "prompt");
    mockedApi.createDashboard.mockResolvedValue(
      dashboard({ id: "new-id", name: "Fresh", isDefault: false, widgets: [] }),
    );
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /New dashboard/ }));
    const dialog = screen.getByRole("dialog", { name: "New dashboard" });
    fireEvent.change(within(dialog).getByLabelText("Dashboard name"), {
      target: { value: "Fresh" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mockedApi.createDashboard).toHaveBeenCalledWith({ name: "Fresh" }));
    expect(promptSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });
});

describe("duplicate widget (pure helper)", () => {
  it("copies the config with a NEW id, placed right after its source", () => {
    const out = duplicateWidgetAt([STAT, INSIGHT], "w-stat");
    expect("widgets" in out).toBe(true);
    if (!("widgets" in out)) return;
    expect(out.widgets.map((w) => w.id)).toEqual(["w-stat", out.newId, "w-ins"]);
    const copy = out.widgets[1]!;
    expect(copy.id).not.toBe("w-stat");
    expect(copy.title).toBe("Runs copy");
    expect(copy.type).toBe("stat");
    expect(copy.size).toBe("s");
    expect(copy.config).toEqual(STAT.config);
  });

  it("deep-copies an insight question (no shared reference)", () => {
    const out = duplicateWidgetAt([INSIGHT], "w-ins");
    if (!("widgets" in out)) throw new Error("expected success");
    const copy = out.widgets[1]!;
    expect(copy.config.insight).toEqual(INSIGHT.config.insight);
    expect(copy.config.insight).not.toBe(INSIGHT.config.insight);
  });

  it("copies only the question — no results/freshness/errors can ride along", () => {
    const out = duplicateWidgetAt([INSIGHT], "w-ins");
    if (!("widgets" in out)) throw new Error("expected success");
    const flat = JSON.stringify(out.widgets[1]);
    for (const banned of ["freshness", "warnings", "value", "buckets", "loading", "error"]) {
      expect(flat).not.toContain(banned);
    }
  });

  it("refuses a malformed widget rather than cloning it", () => {
    const malformed = { ...INSIGHT, id: "bad", config: { source: "any", insight: { nope: 1 } } };
    const out = duplicateWidgetAt([malformed as unknown as AnalyticsWidget], "bad");
    expect("error" in out).toBe(true);
  });

  it("respects the dashboard widget cap", () => {
    const many = Array.from({ length: MAX_DASHBOARD_WIDGETS }, (_, i) => ({
      ...STAT,
      id: `w-${i}`,
    }));
    const out = duplicateWidgetAt(many, "w-0");
    expect("error" in out && out.error).toMatch(/up to 48 widgets/);
  });

  it("refuses an unknown widget id", () => {
    expect("error" in duplicateWidgetAt([STAT], "nope")).toBe(true);
  });
});

describe("duplicate widget (dashboard flow)", () => {
  it("duplicates in edit mode and persists through the atomic save", async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /Edit dashboard/ }));
    const widget = screen.getByTestId("analytics-widget-w-stat");
    fireEvent.click(within(widget).getByRole("button", { name: "Duplicate widget" }));
    expect(screen.getAllByText(/Runs/).length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole("button", { name: /Done editing/ }));
    await waitFor(() => expect(mockedApi.updateDashboard).toHaveBeenCalledTimes(1));
    const saved = mockedApi.updateDashboard.mock.calls[0]![1].widgets as AnalyticsWidget[];
    expect(saved).toHaveLength(3);
    expect(saved[1]!.title).toBe("Runs copy");
    expect(saved[1]!.id).not.toBe("w-stat");
  });

  it("members never see the duplicate control", () => {
    renderDashboard({ canManage: false });
    expect(screen.queryByRole("button", { name: "Duplicate widget" })).toBeNull();
  });

  it("a duplicated preview-source insight still can't bypass exposure", async () => {
    // `previewsrc` is exposure:"preview" — in a production catalog projection
    // it is absent, so BOTH the original and its copy render the repair state.
    const previewWidget: AnalyticsWidget = {
      ...INSIGHT,
      id: "w-prev",
      config: {
        source: "any",
        insight: {
          source: "previewsrc", dataset: "things", measure: "thing_count",
          dimension: null, range: { preset: "30d" }, chart: "kpi",
        },
      },
    };
    const out = duplicateWidgetAt([previewWidget], "w-prev");
    if (!("widgets" in out)) throw new Error("expected success");
    // The copy carries the same declared source; nothing about duplication
    // grants access — the catalog the widget renders against decides.
    expect(out.widgets[1]!.config.insight?.source).toBe("previewsrc");
    render(
      <AnalyticsDashboard
        accountName="Acme Co"
        canManage
        connectedProviders={{}}
        insightCatalog={{ sources: FIXTURE_CATALOG.sources.filter((s) => s.exposure !== "preview") }}
        initialDashboards={[dashboard({ widgets: out.widgets })]}
        initialOverview={OVERVIEW}
        initialRange="7d"
      />,
    );
    await waitFor(() =>
      expect(screen.getAllByText("Settings need an update").length).toBe(2),
    );
    expect(mockedApi.queryInsight).not.toHaveBeenCalled();
  });
});

describe("restore default layout", () => {
  it("confirms, then writes the CANONICAL defaults through the atomic PATCH", async () => {
    renderDashboard({
      dashboards: [dashboard({ widgets: [STAT, INSIGHT] })],
    });
    fireEvent.click(screen.getByRole("button", { name: /Restore default layout/ }));
    const dialog = screen.getByRole("dialog", { name: "Restore the default layout?" });
    expect(dialog.textContent).toMatch(/will be removed/);
    expect(dialog.textContent).toMatch(/other dashboards and your data aren't affected/i);

    fireEvent.click(within(dialog).getByRole("button", { name: "Restore layout" }));
    await waitFor(() => expect(mockedApi.updateDashboard).toHaveBeenCalledTimes(1));
    const [id, patch] = mockedApi.updateDashboard.mock.calls[0]!;
    expect(id).toBe(dashboard().id);
    expect(patch.widgets).toEqual(DEFAULT_OVERVIEW_WIDGETS);
    // Current canonical definitions — never an obsolete stored snapshot.
    expect(patch.widgets).toHaveLength(DEFAULT_OVERVIEW_WIDGETS.length);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancel leaves the board untouched", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /Restore default layout/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockedApi.updateDashboard).not.toHaveBeenCalled();
    expect(screen.getByTestId("analytics-widget-w-stat")).toBeTruthy();
  });

  it("is offered only on the DEFAULT dashboard", () => {
    renderDashboard({
      dashboards: [dashboard({ id: "other", name: "Custom", isDefault: false })],
    });
    expect(screen.queryByRole("button", { name: /Restore default layout/ })).toBeNull();
  });

  it("members never see it", () => {
    renderDashboard({ canManage: false });
    expect(screen.queryByRole("button", { name: /Restore default layout/ })).toBeNull();
  });

  it("surfaces an API failure and keeps the dialog open", async () => {
    mockedApi.updateDashboard.mockRejectedValueOnce(new Error("Couldn't save."));
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /Restore default layout/ }));
    fireEvent.click(screen.getByRole("button", { name: "Restore layout" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't save."));
    expect(screen.getByRole("dialog", { name: "Restore the default layout?" })).toBeTruthy();
  });
});
