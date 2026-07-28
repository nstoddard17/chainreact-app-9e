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

import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import * as analyticsApi from "@/lib/api/analytics";
import { AnalyticsDashboard } from "@/features/analytics/AnalyticsDashboard";
import {
  isPointerInCommitZone,
  moveWidgetTo,
  REORDER_COMMIT_ZONE,
} from "@/features/analytics/dashboardHelpers";
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

/**
 * jsdom lays nothing out, so every rect is 0×0 and the commit-zone guard would
 * take its "can't measure" branch. Give the cards real boxes instead, so these
 * tests exercise the SAME geometry path a browser does.
 */
const RECTS: Record<string, { left: number; top: number; width: number; height: number }> = {
  "w-a": { left: 0, top: 0, width: 200, height: 200 },
  "w-b": { left: 220, top: 0, width: 200, height: 200 },
  "w-c": { left: 440, top: 0, width: 200, height: 200 },
};

function stubRects() {
  for (const [id, r] of Object.entries(RECTS)) {
    const el = screen.getByTestId(`analytics-widget-${id}`);
    el.getBoundingClientRect = () =>
      ({
        ...r,
        right: r.left + r.width,
        bottom: r.top + r.height,
        x: r.left,
        y: r.top,
        toJSON: () => ({}),
      }) as DOMRect;
  }
}

/** The exact centre of a card — the only place a re-order is accepted. */
const centre = (id: string) => {
  const r = RECTS[id] as { left: number; top: number; width: number; height: number };
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
};

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
  stubRects();
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
 * Drag over a widget, by default landing on its centre (a deliberate move).
 *
 * jsdom implements neither `DragEvent` nor a `DataTransfer` on drag events, so
 * an event built from an init alone arrives with null coordinates. A real
 * browser always supplies both, so they are stamped on here rather than making
 * the component defend against a condition that cannot happen in a browser.
 */
const dragOver = (id: string, at?: { clientX: number; clientY: number }) => {
  const el = widgetEl(id);
  const point = at ?? centre(id);
  const event = createEvent.dragOver(el, { dataTransfer: { dropEffect: "none" } });
  Object.defineProperty(event, "clientX", { value: point.clientX });
  Object.defineProperty(event, "clientY", { value: point.clientY });
  fireEvent(el, event);
};

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
    dragOver("w-c");

    // Nothing has been dropped yet, but the grid already shows the result:
    // Bravo and Charlie have shifted back to make room for Alpha.
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);
  });

  it("follows the pointer to a new target without needing a drop", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver("w-c");
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);

    dragOver("w-b");
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
  });

  it("ignores a pointer that has only clipped the edge of a card", () => {
    // The oscillation bug: re-ordering on entry slides cards out from under the
    // pointer, which immediately re-triggers on whatever lands there next, and
    // the grid never settles. Only the centre may claim a slot.
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));

    const c = RECTS["w-c"] as { left: number; top: number; width: number; height: number };
    dragOver("w-c", { clientX: c.left + 4, clientY: c.top + c.height / 2 });
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);

    dragOver("w-c", { clientX: c.left + c.width / 2, clientY: c.top + 4 });
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("re-orders once the pointer reaches the middle of the card", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    const c = RECTS["w-c"] as { left: number; top: number; width: number; height: number };

    dragOver("w-c", { clientX: c.left + 10, clientY: c.top + 10 });
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);

    dragOver("w-c");
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);
  });

  it("hovering the dragged widget itself changes nothing", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-b"));
    dragOver("w-b");
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
    dragOver("w-c");
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });
});

describe("drop-target outline", () => {
  it("marks the dragged widget as the drop preview, at its previewed slot", () => {
    renderEditing();
    expect(document.querySelector("[data-drop-preview]")).toBeNull();

    fireEvent.dragStart(widgetEl("w-a"));
    dragOver("w-c");

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
    dragOver("w-c");
    const previewed = renderedOrder();

    fireEvent.drop(widgetEl("w-c"));
    fireEvent.dragEnd(widgetEl("w-a"));

    expect(renderedOrder()).toEqual(previewed);
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);
  });

  it("a cancelled drag (dragEnd without a drop) restores the real order", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver("w-c");
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);

    fireEvent.dragEnd(widgetEl("w-a"));
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("releasing over a grid gutter still commits the previewed slot", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver("w-b");
    // The pointer leaves the card and is released on the grid itself.
    const grid = widgetEl("w-a").parentElement as HTMLElement;
    fireEvent.drop(grid);
    fireEvent.dragEnd(widgetEl("w-a"));
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
  });

  it("nothing is persisted until Done editing", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver("w-c");
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

describe("isPointerInCommitZone (pure)", () => {
  const rect = { left: 100, top: 100, width: 200, height: 200 };

  it("accepts the exact centre", () => {
    expect(isPointerInCommitZone(rect, 200, 200)).toBe(true);
  });

  it("accepts the boundary of the central band and rejects just past it", () => {
    // Zone is REORDER_COMMIT_ZONE of the box, centred: ±50px on a 200px side.
    const edge = (rect.width * REORDER_COMMIT_ZONE) / 2;
    expect(isPointerInCommitZone(rect, 200 + edge, 200)).toBe(true);
    expect(isPointerInCommitZone(rect, 200 + edge + 1, 200)).toBe(false);
    expect(isPointerInCommitZone(rect, 200, 200 - edge)).toBe(true);
    expect(isPointerInCommitZone(rect, 200, 200 - edge - 1)).toBe(false);
  });

  it("rejects a pointer inside the card but outside the band, on either axis", () => {
    expect(isPointerInCommitZone(rect, 105, 200)).toBe(false);
    expect(isPointerInCommitZone(rect, 200, 295)).toBe(false);
    expect(isPointerInCommitZone(rect, 105, 105)).toBe(false);
  });

  it("allows the move when there is no geometry to judge", () => {
    // A guard that cannot measure must not disable dragging altogether.
    expect(isPointerInCommitZone({ left: 0, top: 0, width: 0, height: 0 }, 0, 0)).toBe(true);
  });
});
