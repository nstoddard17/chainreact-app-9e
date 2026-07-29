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

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as analyticsApi from "@/lib/api/analytics";
import { AnalyticsDashboard } from "@/features/analytics/AnalyticsDashboard";
import { FIXTURE_CATALOG } from "./insights/fixtures";
import type {
  AnalyticsDashboard as Dashboard,
  AnalyticsOverview,
  AnalyticsWidget,
  AnalyticsWidgetSize,
} from "@/contracts/analytics";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S4-EDITOR-INTEGRATION-1 — the shipping editor.
 *
 * The destination is now a PLACE. These tests drive the real component with real
 * pointer events and assert the rectangles it renders and the payload it would
 * save — including the cases the old editor could not express at all, like
 * dropping into a cell no widget occupies.
 *
 * jsdom does not lay out CSS Grid, so geometry is stubbed to the real track
 * arithmetic (4 columns, 190px rows, 14px gaps). Actual pixel rectangles are
 * proven in the Chromium suite.
 */

const mockedApi = analyticsApi as jest.Mocked<typeof analyticsApi>;

const GRID_LEFT = 100;
const GRID_TOP = 50;
const GRID_WIDTH = 800;
const GAP = 14;
const COL = (GRID_WIDTH - GAP * 3) / 4; // 189.5
const ROW = 190;

/** Viewport point at the top-left of a cell, plus the grab offset. */
const cellPoint = (x: number, y: number, grabDx = 5, grabDy = 5) => ({
  clientX: GRID_LEFT + x * (COL + GAP) + grabDx,
  clientY: GRID_TOP + y * (ROW + GAP) + grabDy,
});

const widget = (id: string, size: AnalyticsWidgetSize = "s"): AnalyticsWidget => ({
  id,
  type: "stat",
  size,
  title: id,
  config: { source: "any", metric: "runs" },
});

const OVERVIEW: AnalyticsOverview = {
  range: { id: "7d", since: "2026-07-21", until: "2026-07-28" },
  totals: { runs: 4, succeeded: 4, failed: 0, successRate: 1, avgDurationMs: 10, activeWorkflows: 1, totalWorkflows: 1, connectedApps: 0 },
  previousTotals: { runs: 2, succeeded: 2, failed: 0, successRate: 1, avgDurationMs: 10, activeWorkflows: 1, totalWorkflows: 1, connectedApps: 0 },
  runsOverTime: [], workflows: [], apps: [],
  heatmap: { weeks: 1, cells: [0, 0, 0, 0, 0, 0, 0], maxCell: 0, total: 0 },
  recentRuns: [], truncated: false,
};

function dashboard(widgets: AnalyticsWidget[]): Dashboard {
  return {
    id: "00000000-0000-4000-8000-00000000s4s4",
    name: "Board",
    position: 0,
    isDefault: true,
    widgets,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
}

/** Stub the geometry the drag session measures at drag start. */
function stubGeometry() {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const el = this as HTMLElement;
    if (el.dataset?.testid === "analytics-explicit-grid" || el.querySelector?.("[data-grid-x]")) {
      return { left: GRID_LEFT, top: GRID_TOP, width: GRID_WIDTH, height: 800, right: GRID_LEFT + GRID_WIDTH, bottom: 850, x: GRID_LEFT, y: GRID_TOP, toJSON: () => ({}) } as DOMRect;
    }
    const x = Number(el.dataset?.gridX);
    if (!Number.isNaN(x) && el.dataset?.gridX !== undefined) {
      const y = Number(el.dataset.gridY);
      const w = Number(el.dataset.gridW);
      const h = Number(el.dataset.gridH);
      const left = GRID_LEFT + x * (COL + GAP);
      const top = GRID_TOP + y * (ROW + GAP);
      const width = w * COL + (w - 1) * GAP;
      const height = h * ROW + (h - 1) * GAP;
      return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    }
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
}

type Frame = (time: number) => void;
let rafQueue: Frame[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  rafQueue = [];
  stubGeometry();
  window.requestAnimationFrame = ((cb: Frame) => {
    rafQueue.push(cb);
    return rafQueue.length;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
  Element.prototype.setPointerCapture = function () {};
  Element.prototype.releasePointerCapture = function () {};
  Element.prototype.hasPointerCapture = function () {
    return true;
  };
});

/** Flush the drag session's coalesced pointer frame. */
function flushFrames() {
  act(() => {
    const queued = rafQueue;
    rafQueue = [];
    for (const cb of queued) cb(0);
  });
}

function renderBoard(widgets: AnalyticsWidget[]) {
  return render(
    <AnalyticsDashboard
      accountName="Acct"
      canManage
      connectedProviders={{}}
      insightCatalog={FIXTURE_CATALOG}
      initialDashboards={[dashboard(widgets)]}
      initialOverview={OVERVIEW}
      initialRange="7d"
    />,
  );
}

/**
 * jsdom has no real PointerEvent, and `fireEvent.pointerX` drops `pointerId` /
 * `button` / `pointerType` from the native event the session's own listeners
 * read. Dispatching a plain Event with those properties assigned is what makes
 * the session behave exactly as it does in a browser.
 */
function pointer(
  el: Element,
  type: string,
  init: { pointerId?: number; clientX?: number; clientY?: number; button?: number; pointerType?: string },
) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, { pointerId: 1, button: 0, pointerType: "mouse", ...init });
  act(() => {
    el.dispatchEvent(ev);
  });
}

const enterEdit = () => fireEvent.click(screen.getByRole("button", { name: /Edit dashboard/i }));
const grip = (id: string) => screen.getByTestId(`analytics-widget-drag-handle-${id}`);
const cellRect = (id: string) => {
  const el = screen.getByTestId(`analytics-grid-cell-${id}`);
  return `${el.dataset.gridX},${el.dataset.gridY},${el.dataset.gridW},${el.dataset.gridH}`;
};
const placeholderRect = () => {
  const el = screen.queryByTestId(/^analytics-grid-placeholder/);
  return el ? `${el.dataset.gridX},${el.dataset.gridY},${el.dataset.gridW},${el.dataset.gridH}` : null;
};

/** Press the grip, move to a cell, and (optionally) release. */
const gridEl = () => screen.getByTestId("analytics-explicit-grid").parentElement!;

function drag(id: string, to: { x: number; y: number }, release = true) {
  // Press on the widget where it ACTUALLY is, so the grab offset is realistic.
  const from = screen.getByTestId(`analytics-grid-cell-${id}`);
  pointer(grip(id), "pointerdown", cellPoint(Number(from.dataset.gridX), Number(from.dataset.gridY)));
  pointer(gridEl(), "pointermove", cellPoint(to.x, to.y));
  flushFrames();
  if (release) pointer(gridEl(), "pointerup", cellPoint(to.x, to.y));
}

// ── Rendering ───────────────────────────────────────────────────────────────

describe("the shipping page renders from explicit rectangles", () => {
  it("derives a four-column layout for a legacy board and draws every widget", () => {
    renderBoard([widget("a"), widget("b", "m"), widget("c")]);
    expect(screen.getByTestId("analytics-explicit-grid")).toBeTruthy();
    expect(cellRect("a")).toBe("0,0,1,1");
    expect(cellRect("b")).toBe("1,0,2,1");
    expect(cellRect("c")).toBe("3,0,1,1");
  });

  it("renders a persisted board at its exact coordinates, gaps included", () => {
    renderBoard([
      { ...widget("far"), layout: { x: 3, y: 2, w: 1, h: 1 } },
      { ...widget("near", "m"), layout: { x: 0, y: 0, w: 2, h: 1 } },
    ]);
    expect(cellRect("far")).toBe("3,2,1,1");
    expect(cellRect("near")).toBe("0,0,2,1");
  });

  it("uses the same layout model in view mode and edit mode", () => {
    renderBoard([widget("a"), widget("b", "m")]);
    const before = cellRect("a");
    enterEdit();
    expect(cellRect("a")).toBe(before);
  });
});

// ── Dragging to a place ─────────────────────────────────────────────────────

describe("any valid cell is a destination", () => {
  it("drops a widget into a cell that contains no card at all", () => {
    // Row 1 is entirely empty on a three-widget board.
    renderBoard([widget("a"), widget("b"), widget("c")]);
    enterEdit();
    drag("a", { x: 2, y: 1 });
    expect(cellRect("a")).toBe("2,1,1,1");
    expect(cellRect("b")).toBe("1,0,1,1");
    expect(cellRect("c")).toBe("2,0,1,1");
  });

  it("drops into a brand-new row below the board", () => {
    renderBoard([widget("a"), widget("b")]);
    enterEdit();
    drag("a", { x: 0, y: 3 });
    expect(cellRect("a")).toBe("0,3,1,1");
  });

  it("shows the placeholder at the exact candidate before release", () => {
    renderBoard([widget("a"), widget("b")]);
    enterEdit();
    drag("a", { x: 3, y: 2 }, false);
    expect(placeholderRect()).toBe("3,2,1,1");
  });

  it("commits exactly what the placeholder previewed", () => {
    renderBoard([widget("a"), widget("b")]);
    enterEdit();
    drag("a", { x: 3, y: 2 }, false);
    const previewed = placeholderRect();
    pointer(gridEl(), "pointerup", cellPoint(3, 2));
    expect(cellRect("a")).toBe(previewed);
  });

  it("pushes a wide widget down when a small one lands on it", () => {
    renderBoard([widget("wide", "xl"), widget("small")]);
    enterEdit();
    // wide is at 0,0 (3 cols); small at 3,0. Drop small onto column 1 of wide.
    drag("small", { x: 1, y: 0 });
    expect(cellRect("small")).toBe("1,0,1,1");
    expect(cellRect("wide")).toBe("0,1,3,1");
  });

  it("moving away and back lands exactly where it started", () => {
    renderBoard([widget("a"), widget("b"), widget("c")]);
    enterEdit();
    pointer(grip("a"), "pointerdown", cellPoint(0, 0));
    for (const target of [{ x: 2, y: 1 }, { x: 3, y: 3 }, { x: 0, y: 0 }]) {
      pointer(gridEl(), "pointermove", cellPoint(target.x, target.y));
      flushFrames();
    }
    pointer(gridEl(), "pointerup", cellPoint(0, 0));
    // Every widget is back at its starting rectangle — nothing ratcheted down.
    expect(cellRect("a")).toBe("0,0,1,1");
    expect(cellRect("b")).toBe("1,0,1,1");
    expect(cellRect("c")).toBe("2,0,1,1");
  });
});

// ── Pointer lifecycle (the preserved fixes) ─────────────────────────────────

describe("pointer session lifecycle", () => {
  const startAndMove = () => {
    renderBoard([widget("a"), widget("b")]);
    enterEdit();
    drag("a", { x: 2, y: 2 }, false);
    return gridEl();
  };

  it("captures on the stable grid, never on the grip that reconciliation moves", () => {
    // Capturing on the grip made the drag directional in Chromium: a rightward
    // move relocated the capturing button and the browser dropped capture
    // mid-gesture. The grid never moves, so it is the only safe owner.
    renderBoard([widget("a"), widget("b")]);
    enterEdit();
    const gridSpy = jest.fn();
    const gripSpy = jest.fn();
    gridEl().setPointerCapture = gridSpy;
    grip("a").setPointerCapture = gripSpy;
    pointer(grip("a"), "pointerdown", cellPoint(0, 0));
    expect(gridSpy).toHaveBeenCalledTimes(1);
    expect(gripSpy).not.toHaveBeenCalled();
  });

  it("Escape restores the drag-start layout and clears the overlay", () => {
    startAndMove();
    expect(screen.getByTestId("analytics-drag-overlay")).toBeTruthy();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByTestId("analytics-drag-overlay")).toBeNull();
    expect(placeholderRect()).toBeNull();
    expect(cellRect("a")).toBe("0,0,1,1");
  });

  it("pointercancel restores the drag-start layout", () => {
    const el = startAndMove();
    pointer(el, "pointercancel", {});
    expect(cellRect("a")).toBe("0,0,1,1");
    expect(screen.queryByTestId("analytics-drag-overlay")).toBeNull();
  });

  it("window blur cancels cleanly", () => {
    startAndMove();
    act(() => {
      fireEvent.blur(window);
    });
    expect(cellRect("a")).toBe("0,0,1,1");
    expect(screen.queryByTestId("analytics-drag-overlay")).toBeNull();
  });

  it("a lostpointercapture from a descendant is ignored", () => {
    const el = startAndMove();
    pointer(grip("a"), "lostpointercapture", {});
    // Still dragging: the grid never lost the pointer.
    expect(screen.getByTestId("analytics-drag-overlay")).toBeTruthy();
    pointer(el, "pointerup", cellPoint(2, 2));
    expect(cellRect("a")).toBe("2,2,1,1");
  });

  it("a foreign pointer id cannot move or end the drag", () => {
    const el = startAndMove();
    pointer(el, "pointermove", { pointerId: 99, ...cellPoint(3, 3) });
    flushFrames();
    expect(placeholderRect()).toBe("2,2,1,1");
    pointer(el, "pointerup", { pointerId: 99, ...cellPoint(3, 3) });
    expect(screen.getByTestId("analytics-drag-overlay")).toBeTruthy();
  });

  it("a non-primary mouse button never starts a drag", () => {
    renderBoard([widget("a"), widget("b")]);
    enterEdit();
    pointer(grip("a"), "pointerdown", { button: 2, pointerType: "mouse", ...cellPoint(0, 0) });
    expect(screen.queryByTestId("analytics-drag-overlay")).toBeNull();
  });

  it("places the overlay exactly on the grabbed point, with no jump", () => {
    renderBoard([widget("a"), widget("b")]);
    enterEdit();
    const point = cellPoint(0, 0, 23, 17);
    pointer(grip("a"), "pointerdown", point);
    const overlay = screen.getByTestId("analytics-drag-overlay");
    expect(overlay.style.transform).toBe(
      `translate3d(${point.clientX - 23}px, ${point.clientY - 17}px, 0)`,
    );
  });

  it("leaving edit mode mid-drag tears the session down", () => {
    startAndMove();
    fireEvent.click(screen.getByTestId("analytics-cancel-editing"));
    expect(screen.queryByTestId("analytics-drag-overlay")).toBeNull();
  });
});

// ── Saving ──────────────────────────────────────────────────────────────────

describe("what a save actually sends", () => {
  const legacy = [widget("a"), widget("b", "m")];

  it("a no-change edit session keeps the dashboard legacy", async () => {
    mockedApi.updateDashboard.mockResolvedValueOnce(dashboard(legacy));
    renderBoard(legacy);
    enterEdit();
    fireEvent.click(screen.getByRole("button", { name: /Done editing/i }));
    await waitFor(() => expect(mockedApi.updateDashboard).toHaveBeenCalled());
    const sent = mockedApi.updateDashboard.mock.calls[0]![1].widgets!;
    expect(sent.every((w) => !("layout" in w))).toBe(true);
  });

  it("a title-only edit keeps the dashboard legacy", async () => {
    mockedApi.updateDashboard.mockResolvedValueOnce(dashboard(legacy));
    renderBoard(legacy);
    enterEdit();
    fireEvent.click(screen.getByRole("button", { name: /^a$/ }));
    const input = screen.getByDisplayValue("a");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /Done editing/i }));
    await waitFor(() => expect(mockedApi.updateDashboard).toHaveBeenCalled());
    const sent = mockedApi.updateDashboard.mock.calls[0]![1].widgets!;
    expect(sent.some((w) => w.title === "Renamed")).toBe(true);
    expect(sent.every((w) => !("layout" in w))).toBe(true);
  });

  it("a real move writes a rectangle for every widget", async () => {
    mockedApi.updateDashboard.mockResolvedValueOnce(dashboard(legacy));
    renderBoard(legacy);
    enterEdit();
    drag("a", { x: 0, y: 2 });
    fireEvent.click(screen.getByRole("button", { name: /Done editing/i }));
    await waitFor(() => expect(mockedApi.updateDashboard).toHaveBeenCalled());
    const sent = mockedApi.updateDashboard.mock.calls[0]![1].widgets!;
    expect(sent).toHaveLength(2);
    expect(sent.every((w) => w.layout)).toBe(true);
    expect(sent.find((w) => w.id === "a")?.layout).toEqual({ x: 0, y: 2, w: 1, h: 1 });
  });

  it("a drag that ends where it began does not convert the dashboard", async () => {
    mockedApi.updateDashboard.mockResolvedValueOnce(dashboard(legacy));
    renderBoard(legacy);
    enterEdit();
    drag("a", { x: 0, y: 0 });
    fireEvent.click(screen.getByRole("button", { name: /Done editing/i }));
    await waitFor(() => expect(mockedApi.updateDashboard).toHaveBeenCalled());
    expect(
      mockedApi.updateDashboard.mock.calls[0]![1].widgets!.every((w) => !("layout" in w)),
    ).toBe(true);
  });

  it("a failed save keeps the user in edit mode with their arrangement intact", async () => {
    mockedApi.updateDashboard.mockRejectedValueOnce(new Error("nope"));
    renderBoard(legacy);
    enterEdit();
    drag("a", { x: 0, y: 2 });
    fireEvent.click(screen.getByRole("button", { name: /Done editing/i }));
    await waitFor(() => expect(screen.getByText(/Couldn't save your changes/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Done editing/i })).toBeTruthy();
    expect(cellRect("a")).toBe("0,2,1,1");
  });

  it("cancel restores the saved arrangement", () => {
    renderBoard(legacy);
    enterEdit();
    drag("a", { x: 0, y: 2 });
    expect(cellRect("a")).toBe("0,2,1,1");
    fireEvent.click(screen.getByTestId("analytics-cancel-editing"));
    expect(cellRect("a")).toBe("0,0,1,1");
    expect(mockedApi.updateDashboard).not.toHaveBeenCalled();
  });
});

// ── Add / resize bridges ────────────────────────────────────────────────────

describe("adding and resizing keep the board valid", () => {
  it("places a new widget in a gap inside the board, not appended below it", () => {
    renderBoard([widget("a"), widget("b"), widget("c"), widget("wide", "m")]);
    enterEdit();
    fireEvent.click(screen.getAllByRole("button", { name: /Add a widget/i })[0]!);
    // The library lists one button per widget type; the first is a stat tile.
    const library = screen.getByLabelText("Add a widget");
    const entries = Array.from(library.querySelectorAll("button")).filter(
      (b) => b.getAttribute("aria-label") !== "Close",
    );
    fireEvent.click(entries[0]!);
    const cells = screen.getAllByTestId(/^analytics-grid-cell-/);
    const added = cells.find((el) => !["a", "b", "c", "wide"].includes(el.dataset.widgetId!))!;
    const x = Number(added.dataset.gridX);
    const y = Number(added.dataset.gridY);
    const w = Number(added.dataset.gridW);
    // The board is a,b,c across row 0 and a 2-wide on row 1, leaving holes at
    // (3,0), (2,1) and (3,1). The first-fit scan must reuse one of them rather
    // than append a new row — the append-only behaviour S4 replaced.
    expect(y).toBeLessThanOrEqual(1);
    expect(x + w).toBeLessThanOrEqual(4);
    const occupied = new Set(
      cells
        .filter((el) => el !== added)
        .map((el) => `${el.dataset.gridX},${el.dataset.gridY}`),
    );
    expect(occupied.has(`${x},${y}`)).toBe(false);
  });

  it("resizing updates the preset and the rectangle together", () => {
    renderBoard([widget("a"), widget("z")]);
    enterEdit();
    fireEvent.change(screen.getAllByLabelText("Resize widget")[0]!, { target: { value: "m" } });
    expect(cellRect("a")).toBe("0,0,2,1");
    expect(cellRect("z")).toBe("1,1,1,1");
  });

  it("disables presets that would cross the right edge at the widget's column", () => {
    renderBoard([
      { ...widget("edge"), layout: { x: 3, y: 0, w: 1, h: 1 } },
      { ...widget("left"), layout: { x: 0, y: 0, w: 1, h: 1 } },
    ]);
    enterEdit();
    const selects = screen.getAllByLabelText("Resize widget");
    const edgeSelect = selects.find((s) =>
      s.closest("[data-widget-id]")?.getAttribute("data-widget-id") === "edge",
    )! as HTMLSelectElement;
    const disabled = Array.from(edgeSelect.options).filter((o) => o.disabled).map((o) => o.value);
    expect(disabled.sort()).toEqual(["l", "m", "w", "xl"]);
    expect(edgeSelect.title).toContain("Move this widget left to use this size.");
  });
});
