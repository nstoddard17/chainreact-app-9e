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

import { fireEvent, render, screen } from "@testing-library/react";
import * as analyticsApi from "@/lib/api/analytics";
import { AnalyticsDashboard } from "@/features/analytics/AnalyticsDashboard";
import { moveWidgetTo } from "@/features/analytics/dashboardHelpers";
import type {
  AnalyticsDashboard as Dashboard,
  AnalyticsOverview,
  AnalyticsWidget,
} from "@/contracts/analytics";
import { FIXTURE_CATALOG, kpiResult } from "./insights/fixtures";

const mockedApi = analyticsApi as jest.Mocked<typeof analyticsApi>;

/**
 * CD-DRAG-1 — edit-mode drag reorder shows a LIVE preview: the other widgets
 * move aside into their real resting places and the dragged widget outlines the
 * slot it will occupy. The contract these tests defend is that the preview and
 * the committed drop are the same reorder — a preview that showed one layout and
 * saved another would be a lie about what the drop does.
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

const stat = (id: string, title: string, size: AnalyticsWidget["size"]): AnalyticsWidget => ({
  id,
  type: "stat",
  size,
  title,
  config: { source: "any", metric: "runs" },
});

const A = stat("w-a", "Alpha", "s");
const B = stat("w-b", "Bravo", "m");
const C = stat("w-c", "Charlie", "l");

function dashboard(widgets: AnalyticsWidget[] = [A, B, C]): Dashboard {
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

function renderEditing(widgets?: AnalyticsWidget[]) {
  const view = render(
    <AnalyticsDashboard
      accountName="Acme Co"
      canManage
      connectedProviders={{ acme: true }}
      insightCatalog={FIXTURE_CATALOG}
      initialDashboards={[dashboard(widgets)]}
      initialOverview={OVERVIEW}
      initialRange="7d"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Edit dashboard/ }));
  return view;
}

/** The grid's current DOM order — what CSS grid auto-places from. */
function renderedOrder(): string[] {
  return Array.from(document.querySelectorAll("[data-widget-id]")).map(
    (el) => (el as HTMLElement).dataset.widgetId as string,
  );
}

const widgetEl = (id: string) => screen.getByTestId(`analytics-widget-${id}`);

/**
 * jsdom does not attach a DataTransfer to synthetic drag events, but a real
 * browser always does — and the handler sets `dropEffect` on it, so supply one
 * rather than making the component defend against a browser condition that
 * cannot happen.
 */
const dragOver = (el: HTMLElement) =>
  fireEvent.dragOver(el, { dataTransfer: { dropEffect: "none" } });

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.queryInsight.mockResolvedValue({ ok: true, result: kpiResult() });
  mockedApi.updateDashboard.mockImplementation(async (id, patch) => ({
    ...dashboard(),
    id,
    ...(patch.widgets !== undefined ? { widgets: patch.widgets as AnalyticsWidget[] } : {}),
  }));
});

describe("drag preview — the other widgets move aside", () => {
  it("reorders the rendered grid while the drag is still in flight", () => {
    renderEditing();
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);

    fireEvent.dragStart(widgetEl("w-a"));
    dragOver(widgetEl("w-c"));

    // Nothing has been dropped yet, but the grid already shows the result:
    // Bravo and Charlie have shifted back to make room for Alpha.
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);
  });

  it("follows the pointer to a new target without needing a drop", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver(widgetEl("w-c"));
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);

    dragOver(widgetEl("w-b"));
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
  });

  it("hovering the dragged widget itself changes nothing", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-b"));
    dragOver(widgetEl("w-b"));
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("does not preview outside edit mode (drag is disabled there)", () => {
    render(
      <AnalyticsDashboard
        accountName="Acme Co"
        canManage
        connectedProviders={{ acme: true }}
        insightCatalog={FIXTURE_CATALOG}
        initialDashboards={[dashboard()]}
        initialOverview={OVERVIEW}
        initialRange="7d"
      />,
    );
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver(widgetEl("w-c"));
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });
});

describe("drop-target outline", () => {
  it("marks the dragged widget as the drop preview, at its previewed slot", () => {
    renderEditing();
    expect(document.querySelector("[data-drop-preview]")).toBeNull();

    fireEvent.dragStart(widgetEl("w-a"));
    dragOver(widgetEl("w-c"));

    const preview = document.querySelectorAll("[data-drop-preview]");
    expect(preview).toHaveLength(1);
    expect((preview[0] as HTMLElement).dataset.widgetId).toBe("w-a");
    // The outline overlay is the widget's own footprint, so it spans exactly the
    // columns/rows the widget will occupy once dropped.
    expect(widgetEl("w-a").className).toContain("col-span-1");
    expect(screen.getByTestId("analytics-drop-preview-w-a").textContent).toBe("1×1");
  });

  it("names the footprint of a multi-cell widget", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-c"));
    expect(widgetEl("w-c").className).toContain("col-span-2");
    expect(widgetEl("w-c").className).toContain("row-span-2");
    expect(screen.getByTestId("analytics-drop-preview-w-c").textContent).toBe("2×2");
  });

  it("clears the outline when the drag ends", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    fireEvent.dragEnd(widgetEl("w-a"));
    expect(document.querySelector("[data-drop-preview]")).toBeNull();
  });
});

describe("commit and cancel", () => {
  it("the drop commits exactly the order the preview showed", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver(widgetEl("w-c"));
    const previewed = renderedOrder();

    fireEvent.drop(widgetEl("w-c"));
    fireEvent.dragEnd(widgetEl("w-a"));

    expect(renderedOrder()).toEqual(previewed);
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);
  });

  it("a cancelled drag (dragEnd without a drop) restores the real order", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver(widgetEl("w-c"));
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);

    fireEvent.dragEnd(widgetEl("w-a"));
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("releasing over a grid gutter still commits the previewed slot", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver(widgetEl("w-b"));
    // The pointer leaves the card and is released on the grid itself.
    const grid = widgetEl("w-a").parentElement as HTMLElement;
    fireEvent.drop(grid);
    fireEvent.dragEnd(widgetEl("w-a"));
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
  });

  it("nothing is persisted until Done editing", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver(widgetEl("w-c"));
    fireEvent.drop(widgetEl("w-c"));
    expect(mockedApi.updateDashboard).not.toHaveBeenCalled();
  });
});

describe("moveWidgetTo (pure)", () => {
  it("dragging forwards lands after the target", () => {
    expect(moveWidgetTo([A, B, C], "w-a", "w-c")?.map((w) => w.id)).toEqual([
      "w-b",
      "w-c",
      "w-a",
    ]);
  });

  it("dragging backwards lands before the target", () => {
    expect(moveWidgetTo([A, B, C], "w-c", "w-a")?.map((w) => w.id)).toEqual([
      "w-c",
      "w-a",
      "w-b",
    ]);
  });

  it("refuses no-op and unknown moves so the caller can keep its array", () => {
    expect(moveWidgetTo([A, B, C], "w-a", "w-a")).toBeNull();
    expect(moveWidgetTo([A, B, C], "w-a", "nope")).toBeNull();
    expect(moveWidgetTo([A, B, C], "nope", "w-a")).toBeNull();
  });

  it("never mutates the input list", () => {
    const input = [A, B, C];
    moveWidgetTo(input, "w-a", "w-c");
    expect(input.map((w) => w.id)).toEqual(["w-a", "w-b", "w-c"]);
  });
});
