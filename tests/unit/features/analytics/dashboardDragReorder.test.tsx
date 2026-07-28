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
  hasTravelledEnoughToReorder,
  isPointerInCommitZone,
  moveWidgetTo,
  REORDER_COMMIT_ZONE,
  REORDER_TRAVEL_PX,
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
 * take its "can't measure" branch.
 *
 * Model the real thing instead: three fixed SLOTS in a row, with whichever card
 * currently sits in a slot occupying that box. Pinning a box to a widget id
 * would miss the bug this file exists to cover — after a re-order the cards have
 * swapped slots, and dragging "back to where it came from" means hovering
 * whatever moved into the slot you left.
 */
const SLOT_SIZE = 200;
const SLOT_PITCH = 220;
const slotRect = (index: number) => ({
  left: index * SLOT_PITCH,
  top: 0,
  width: SLOT_SIZE,
  height: SLOT_SIZE,
});

/** Re-stamp every card with the box of the slot it currently occupies. */
function relayout() {
  const cards = Array.from(document.querySelectorAll("[data-widget-id]")) as HTMLElement[];
  cards.forEach((card, index) => {
    const r = slotRect(index);
    card.getBoundingClientRect = () =>
      ({
        ...r,
        right: r.left + r.width,
        bottom: r.top + r.height,
        x: r.left,
        y: r.top,
        toJSON: () => ({}),
      }) as DOMRect;
  });
}

const slotCentre = (index: number) => ({
  clientX: index * SLOT_PITCH + SLOT_SIZE / 2,
  clientY: SLOT_SIZE / 2,
});

/** The centre of the slot a card is in right now — where a re-order is accepted. */
const centre = (id: string) => {
  relayout();
  const r = widgetEl(id).getBoundingClientRect();
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
  relayout();
  return view;
}

/** Hover the middle of a SLOT — whichever card is sitting there right now. */
function hoverSlot(index: number) {
  relayout();
  const card = document.querySelectorAll("[data-widget-id]")[index] as HTMLElement;
  const point = slotCentre(index);
  const event = createEvent.dragOver(card, { dataTransfer: { dropEffect: "none" } });
  Object.defineProperty(event, "clientX", { value: point.clientX });
  Object.defineProperty(event, "clientY", { value: point.clientY });
  fireEvent(card, event);
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
  relayout();
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

    // Bravo now sits in slot 0; hovering it puts Alpha back at the front.
    dragOver("w-b");
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("moves one slot and back again, in a single drag", () => {
    // The reported bug. Stepping Alpha one slot right leaves Bravo in slot 0;
    // dragging back over slot 0 must undo it. Recomputing the preview from the
    // COMMITTED order can't: the only target that would restore the original is
    // the dragged widget itself, which is never a target — so the layout got
    // stuck one slot over and only a second slot's travel did anything.
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));

    hoverSlot(1);
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);

    hoverSlot(0);
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);

    // And it keeps working, rather than needing an ever-larger gesture.
    hoverSlot(1);
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
  });

  it("steps through consecutive slots one at a time", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));

    hoverSlot(1);
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
    hoverSlot(2);
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);
    hoverSlot(1);
    expect(renderedOrder()).toEqual(["w-b", "w-a", "w-c"]);
  });

  it("stops after one swap while the pointer sits still", () => {
    // The slingshot: a re-order moves a card's middle under a stationary
    // pointer, which then qualifies to re-order straight back, forever. Only
    // the pointer's own travel can distinguish that from a real move, so the
    // layout must be inert while the pointer is not moving.
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver("w-c");
    const settled = renderedOrder();
    expect(settled).toEqual(["w-b", "w-c", "w-a"]);

    // The pointer has not moved from where it caused the swap.
    const held = slotCentre(2);
    for (let i = 0; i < 6; i += 1) {
      dragOver("w-b", held);
      dragOver("w-c", held);
    }
    expect(renderedOrder()).toEqual(settled);
  });

  it("ignores a jitter smaller than a deliberate move", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver("w-c");
    const held = slotCentre(2);

    dragOver("w-b", { clientX: held.clientX + 5, clientY: held.clientY - 3 });
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);
  });

  it("moving back re-orders as soon as the pointer has travelled, in ONE gesture", () => {
    // The move-back must not depend on catching a sample in the gap between two
    // middles: dragover only reports where the pointer IS, and a quick gesture
    // can jump straight from one middle to another without ever landing there.
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    dragOver("w-c");
    expect(renderedOrder()).toEqual(["w-b", "w-c", "w-a"]);

    dragOver("w-b");
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("ignores a pointer that has only clipped the edge of a card", () => {
    // The oscillation bug: re-ordering on entry slides cards out from under the
    // pointer, which immediately re-triggers on whatever lands there next, and
    // the grid never settles. Only the centre may claim a slot.
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));

    const c = slotRect(2); // Charlie starts in the third slot
    dragOver("w-c", { clientX: c.left + 4, clientY: c.top + c.height / 2 });
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);

    dragOver("w-c", { clientX: c.left + c.width / 2, clientY: c.top + 4 });
    expect(renderedOrder()).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("re-orders once the pointer reaches the middle of the card", () => {
    renderEditing();
    fireEvent.dragStart(widgetEl("w-a"));
    const c = slotRect(2); // Charlie starts in the third slot

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

describe("hasTravelledEnoughToReorder (pure)", () => {
  const origin = { x: 100, y: 100 };

  it("rejects a stationary pointer — the slingshot's only fuel", () => {
    expect(hasTravelledEnoughToReorder(origin, { ...origin })).toBe(false);
  });

  it("measures real distance, not per-axis, so diagonal travel counts", () => {
    // 30px on each axis is under the threshold per-axis but ~42px in total.
    expect(hasTravelledEnoughToReorder(origin, { x: 130, y: 130 })).toBe(true);
  });

  it("accepts exactly the threshold and rejects just under it", () => {
    expect(hasTravelledEnoughToReorder(origin, { x: 100 + REORDER_TRAVEL_PX, y: 100 })).toBe(true);
    expect(hasTravelledEnoughToReorder(origin, { x: 100 + REORDER_TRAVEL_PX - 1, y: 100 })).toBe(
      false,
    );
  });

  it("is direction-agnostic — moving back counts the same as moving on", () => {
    expect(hasTravelledEnoughToReorder(origin, { x: 100 - REORDER_TRAVEL_PX, y: 100 })).toBe(true);
    expect(hasTravelledEnoughToReorder(origin, { x: 100, y: 100 - REORDER_TRAVEL_PX })).toBe(true);
  });
});
