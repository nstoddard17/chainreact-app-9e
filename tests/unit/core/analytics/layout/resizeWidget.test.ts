import {
  ANALYTICS_CANONICAL_COLUMNS,
  placeWidget,
  resizeWidget,
  resizeWidgetToFootprint,
  validateLayout,
  type AnalyticsLayout,
  type GridRect,
  type LayoutResult,
  type PlacedWidget,
} from "@/core/analytics/layout";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1 — resize.
 *
 * The audit's central resize finding was that the shipped system ran a second,
 * incompatible algorithm for it. The guarantee these tests protect is that
 * resize and movement are the SAME operation: identical collision outcomes,
 * identical refusals, identical no-compaction policy.
 */

const COLUMNS = ANALYTICS_CANONICAL_COLUMNS;
const OPTIONS = { columnCount: COLUMNS, collisionPolicy: "push-down" as const };

const at = (widgetId: string, x: number, y: number, w = 1, h = 1): PlacedWidget => ({
  widgetId,
  x,
  y,
  w,
  h,
});

function committed(result: LayoutResult): AnalyticsLayout {
  if (!result.ok) throw new Error(`expected a resize, got ${result.reason}: ${result.message}`);
  expect(validateLayout(result.layout, COLUMNS)).toEqual({ ok: true });
  return result.layout;
}

function board(layout: AnalyticsLayout): Record<string, GridRect> {
  return Object.fromEntries(layout.map((w) => [w.widgetId, { x: w.x, y: w.y, w: w.w, h: w.h }]));
}

describe("growing a widget", () => {
  it("expands into free cells without disturbing anything", () => {
    const layout = [at("mover", 0, 0), at("below", 0, 2)];
    const next = committed(resizeWidget(layout, "mover", { x: 0, y: 0, w: 3, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      mover: { x: 0, y: 0, w: 3, h: 1 },
      below: { x: 0, y: 2, w: 1, h: 1 },
    });
  });

  it("pushes the widgets it grows into downward, exactly as a move would", () => {
    const layout = [at("mover", 0, 0), at("a", 1, 0), at("b", 2, 0)];
    const next = committed(resizeWidget(layout, "mover", { x: 0, y: 0, w: 3, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      mover: { x: 0, y: 0, w: 3, h: 1 },
      a: { x: 1, y: 1, w: 1, h: 1 },
      b: { x: 2, y: 1, w: 1, h: 1 },
    });
  });

  it("pushes downward when it grows taller, not just wider", () => {
    const layout = [at("mover", 0, 0), at("under", 0, 1)];
    const next = committed(resizeWidget(layout, "mover", { x: 0, y: 0, w: 1, h: 2 }, OPTIONS));
    expect(board(next)).toEqual({
      mover: { x: 0, y: 0, w: 1, h: 2 },
      under: { x: 0, y: 2, w: 1, h: 1 },
    });
  });

  it("grows flush to the last column when the footprint ends exactly on it", () => {
    const layout = [at("mover", 2, 0)];
    const next = committed(resizeWidget(layout, "mover", { x: 2, y: 0, w: 2, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({ mover: { x: 2, y: 0, w: 2, h: 1 } });
  });

  it("refuses to grow past the last column rather than sliding the widget left to fit", () => {
    // Silently relocating a widget the user only asked to widen is exactly the
    // preview-does-not-match-commit behaviour being removed.
    const layout = [at("mover", 3, 0)];
    const result = resizeWidget(layout, "mover", { x: 3, y: 0, w: 2, h: 1 }, OPTIONS);
    expect(result).toMatchObject({ ok: false, reason: "exceeds-columns" });
  });
});

describe("shrinking a widget", () => {
  it("preserves the resulting gap instead of closing it up", () => {
    const layout = [at("mover", 0, 0, 4, 1), at("below", 0, 1)];
    const next = committed(resizeWidget(layout, "mover", { x: 0, y: 0, w: 1, h: 1 }, OPTIONS));
    // Columns 1-3 of row 0 are now empty, and `below` did not rise into them.
    expect(board(next)).toEqual({
      mover: { x: 0, y: 0, w: 1, h: 1 },
      below: { x: 0, y: 1, w: 1, h: 1 },
    });
  });

  it("leaves the vacated rows empty when it becomes shorter", () => {
    const layout = [at("mover", 0, 0, 1, 3), at("side", 1, 0)];
    const next = committed(resizeWidget(layout, "mover", { x: 0, y: 0, w: 1, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      mover: { x: 0, y: 0, w: 1, h: 1 },
      side: { x: 1, y: 0, w: 1, h: 1 },
    });
  });
});

describe("resize and movement share one collision engine", () => {
  const layout: AnalyticsLayout = [at("mover", 0, 0), at("a", 1, 0), at("b", 2, 0), at("c", 0, 1)];
  const target = { x: 0, y: 0, w: 3, h: 1 };

  it("produces the identical board whichever entry point is used", () => {
    const viaResize = committed(resizeWidget(layout, "mover", target, OPTIONS));
    const viaPlace = committed(placeWidget(layout, "mover", target, OPTIONS));
    expect(viaResize).toEqual(viaPlace);
  });

  it("refuses the identical cases", () => {
    const bad = { x: 3, y: 0, w: 2, h: 1 };
    expect(resizeWidget(layout, "mover", bad, OPTIONS)).toEqual(
      placeWidget(layout, "mover", bad, OPTIONS),
    );
  });
});

describe("resizing by size preset keeps the widget where it is", () => {
  it("changes only the footprint, leaving the origin alone", () => {
    const layout = [at("a", 0, 0, 2, 1), at("mover", 2, 1)];
    const next = committed(resizeWidgetToFootprint(layout, "mover", { w: 2, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      a: { x: 0, y: 0, w: 2, h: 1 },
      mover: { x: 2, y: 1, w: 2, h: 1 },
    });
  });

  it("pushes what the new footprint now covers", () => {
    const layout = [at("mover", 0, 1), at("neighbour", 1, 1)];
    const next = committed(resizeWidgetToFootprint(layout, "mover", { w: 2, h: 1 }, OPTIONS));
    expect(board(next)).toEqual({
      mover: { x: 0, y: 1, w: 2, h: 1 },
      neighbour: { x: 1, y: 2, w: 1, h: 1 },
    });
  });

  it("refuses a preset the widget's current column cannot accommodate", () => {
    const layout = [at("mover", 3, 0)];
    const result = resizeWidgetToFootprint(layout, "mover", { w: 2, h: 1 }, OPTIONS);
    expect(result).toMatchObject({ ok: false, reason: "exceeds-columns" });
  });

  it("refuses a widget that is not on the board", () => {
    const result = resizeWidgetToFootprint([at("a", 0, 0)], "ghost", { w: 2, h: 1 }, OPTIONS);
    expect(result).toMatchObject({ ok: false, reason: "unknown-widget" });
  });

  it("does not mutate the caller's layout", () => {
    const layout: AnalyticsLayout = [at("mover", 0, 0), at("other", 1, 0)];
    const snapshot = JSON.parse(JSON.stringify(layout)) as unknown;
    resizeWidgetToFootprint(layout, "mover", { w: 2, h: 2 }, OPTIONS);
    expect(JSON.parse(JSON.stringify(layout))).toEqual(snapshot);
  });
});
