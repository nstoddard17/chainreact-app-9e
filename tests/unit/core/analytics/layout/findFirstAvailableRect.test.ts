import {
  ANALYTICS_CANONICAL_COLUMNS,
  findFirstAvailableRect,
  type AnalyticsLayout,
  type PlacedWidget,
} from "@/core/analytics/layout";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S1-ENGINE-1 — first-fit scanning.
 *
 * This is what "add a widget into the first fitting gap" and the canonical
 * legacy migration both stand on. The behaviour it must NOT have is the one the
 * shipped CSS sparse auto-flow has: skipping a column because the next widget
 * was too wide, and then never coming back to it.
 */

const COLUMNS = ANALYTICS_CANONICAL_COLUMNS;
const at = (widgetId: string, x: number, y: number, w = 1, h = 1): PlacedWidget => ({
  widgetId,
  x,
  y,
  w,
  h,
});

describe("the first fitting rectangle is chosen top-to-bottom, then left-to-right", () => {
  it("uses the top-left cell of an empty board", () => {
    expect(findFirstAvailableRect([], { w: 1, h: 1 }, COLUMNS)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("takes the leftmost free column on the topmost row that has one", () => {
    const layout: AnalyticsLayout = [at("a", 0, 0), at("b", 2, 0)];
    expect(findFirstAvailableRect(layout, { w: 1, h: 1 }, COLUMNS)).toEqual({
      x: 1,
      y: 0,
      w: 1,
      h: 1,
    });
  });

  it("reuses an opening a wider neighbour left behind — the gap sparse auto-flow abandons", () => {
    // Row 0 has a single free cell at column 3; row 1 is wide open. A 1×1 must
    // take the row-0 cell, not start a tidy new row.
    const layout: AnalyticsLayout = [at("a", 0, 0), at("b", 1, 0), at("c", 2, 0), at("d", 0, 1, 2, 1)];
    expect(findFirstAvailableRect(layout, { w: 1, h: 1 }, COLUMNS)).toEqual({
      x: 3,
      y: 0,
      w: 1,
      h: 1,
    });
  });

  it("skips an opening that is too narrow for the footprint and drops to a row that fits", () => {
    // Only column 3 is free on row 0 — a 2-wide widget cannot use it.
    const layout: AnalyticsLayout = [at("a", 0, 0, 3, 1)];
    expect(findFirstAvailableRect(layout, { w: 2, h: 1 }, COLUMNS)).toEqual({
      x: 0,
      y: 1,
      w: 2,
      h: 1,
    });
  });

  it("requires every row of a tall footprint to be free, not just the first", () => {
    // Column 0 is free on row 0 but occupied on row 1, so a 1×2 cannot start there.
    const layout: AnalyticsLayout = [at("a", 1, 0, 3, 1), at("b", 0, 1, 4, 1)];
    expect(findFirstAvailableRect(layout, { w: 1, h: 2 }, COLUMNS)).toEqual({
      x: 0,
      y: 2,
      w: 1,
      h: 2,
    });
  });

  it("opens a new row below the board when nothing above it fits", () => {
    const layout: AnalyticsLayout = [at("a", 0, 0, 4, 1), at("b", 0, 1, 4, 1)];
    expect(findFirstAvailableRect(layout, { w: 4, h: 1 }, COLUMNS)).toEqual({
      x: 0,
      y: 2,
      w: 4,
      h: 1,
    });
  });

  it("finds a hole several rows down when the rows above are full", () => {
    const layout: AnalyticsLayout = [
      at("a", 0, 0, 4, 1),
      at("b", 0, 1, 4, 1),
      at("c", 0, 2, 2, 1),
      at("d", 3, 2),
    ];
    expect(findFirstAvailableRect(layout, { w: 1, h: 1 }, COLUMNS)).toEqual({
      x: 2,
      y: 2,
      w: 1,
      h: 1,
    });
  });

  it("returns the same rectangle for repeated calls on the same board", () => {
    const layout: AnalyticsLayout = [at("a", 0, 0), at("b", 2, 0, 2, 1)];
    const first = findFirstAvailableRect(layout, { w: 1, h: 1 }, COLUMNS);
    expect(findFirstAvailableRect(layout, { w: 1, h: 1 }, COLUMNS)).toEqual(first);
  });

  it("refuses a footprint wider than the board instead of guessing at a fit", () => {
    expect(findFirstAvailableRect([], { w: 5, h: 1 }, COLUMNS)).toBeNull();
  });

  it.each([
    ["zero width", { w: 0, h: 1 }],
    ["a fractional height", { w: 1, h: 1.5 }],
  ])("refuses %s", (_name, size) => {
    expect(findFirstAvailableRect([], size, COLUMNS)).toBeNull();
  });

  it("does not mutate the layout it scans", () => {
    const layout: AnalyticsLayout = [at("a", 0, 0), at("b", 2, 0)];
    const snapshot = JSON.parse(JSON.stringify(layout)) as unknown;
    findFirstAvailableRect(layout, { w: 2, h: 2 }, COLUMNS);
    expect(JSON.parse(JSON.stringify(layout))).toEqual(snapshot);
  });
});
